// import "./instrument.js"
import * as Sentry from "@sentry/node";
import { createInstrumentedCodex } from "@sentry/node";
import { config as loadEnv } from "dotenv";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

loadEnv({ path: resolve(__dirname, "../.env.local"), override: true });
import WebSocket from "ws";
import os from "os";
import { randomUUID } from "crypto";
import {
  CLAUDE_SYSTEM_PROMPT,
  CODEX_SYSTEM_PROMPT,
  type RunnerCommand,
  type RunnerEvent,
  type AgentId,
} from "@sentryvibe/agent-core";
import { createBuildStream } from "./lib/build/engine.js";
import { startDevServer, stopDevServer } from "./lib/process-manager.js";
import { getWorkspaceRoot } from "./lib/workspace.js";
import {
  transformAgentMessageToSSE,
  resetTransformerState,
  setExpectedCwd,
} from "./lib/message-transformer.js";
import { orchestrateBuild } from "./lib/build-orchestrator.js";
import { tunnelManager } from "./lib/tunnel/manager.js";
import { allocatePort, releasePort } from "./lib/port-allocator.js";
import { waitForPort } from "./lib/port-checker.js";
import { createProjectScopedPermissionHandler } from "./lib/permissions/project-scoped-handler.js";

export interface RunnerOptions {
  brokerUrl?: string;
  sharedSecret?: string;
  runnerId?: string;
  workspace?: string;
  heartbeatInterval?: number;
}

const log = (...args: unknown[]) => {
  console.log("[runner]", ...args);
};

const DEFAULT_AGENT: AgentId = "claude-code";
const CLAUDE_MODEL = "claude-sonnet-4-5";
const CODEX_MODEL = "gpt-5-codex";
type CodexEvent = {
  type: string;
  item?: Record<string, unknown>;
  finalResponse?: string;
  usage?: unknown;
  error?: unknown;
};

type BuildQueryFn = (
  prompt: string,
  workingDirectory: string,
  systemPrompt: string,
  agent?: AgentId
) => AsyncGenerator<unknown, void, unknown>;

function resolveCodexItemType(item: Record<string, unknown> | undefined): string {
  if (!item) return "";
  if (typeof item.type === "string") return item.type;
  if (typeof (item as { item_type?: unknown }).item_type === "string") {
    return String((item as { item_type?: unknown }).item_type);
  }
  return "";
}

function resolveCodexItemId(item: Record<string, unknown> | undefined): string {
  if (!item) return randomUUID();
  const candidateKeys = ["id", "item_id", "tool_call_id", "tool_use_id"] as const;
  for (const key of candidateKeys) {
    const value = item[key as keyof typeof item];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return randomUUID();
}

function extractCodexToolInput(item: Record<string, unknown> | undefined) {
  if (!item) return {};
  const possibleKeys = ["arguments", "args", "input"] as const;
  for (const key of possibleKeys) {
    const value = item[key as keyof typeof item];
    if (value !== undefined) {
      return value;
    }
  }
  return {};
}

function extractCodexToolOutput(item: Record<string, unknown> | undefined) {
  if (!item) return null;
  const possibleKeys = [
    "aggregated_output",
    "output",
    "stdout",
    "result",
    "response",
    "content",
  ] as const;
  for (const key of possibleKeys) {
    const value = item[key as keyof typeof item];
    if (value !== undefined) {
      return value;
    }
  }
  return null;
}

async function* convertCodexEventsToAgentMessages(
  events: AsyncIterable<unknown>
): AsyncGenerator<Record<string, unknown>, void, unknown> {
  for await (const rawEvent of events) {
    const event = rawEvent as CodexEvent;
    const item = (event.item ?? undefined) as unknown as
      | Record<string, unknown>
      | undefined;
    const itemType = resolveCodexItemType(item);
    const itemId = resolveCodexItemId(item);

    switch (event.type) {
      case "item.started": {
        if (itemType === "tool_call" || itemType === "mcp_tool_call") {
          yield {
            type: "assistant",
            message: {
              id: itemId,
              content: [
                {
                  type: "tool_use",
                  id: itemId,
                  name:
                    (item?.name as string) ||
                    (item?.tool_name as string) ||
                    "tool_call",
                  input: extractCodexToolInput(item),
                },
              ],
            },
          };
        } else if (itemType === "command_execution") {
          yield {
            type: "assistant",
            message: {
              id: itemId,
              content: [
                {
                  type: "tool_use",
                  id: itemId,
                  name: "command_execution",
                  input: {
                    command:
                      (item?.command as string) ||
                      (item?.cmd as string) ||
                      "",
                  },
                },
              ],
            },
          };
        }
        break;
      }
      case "item.completed": {
        if (itemType === "assistant_message" || itemType === "agent_message") {
          const text = (item?.text as string) || "";
          if (text.trim().length > 0) {
            yield {
              type: "assistant",
              message: {
                id: itemId,
                content: [
                  {
                    type: "text",
                    text,
                  },
                ],
              },
            };
          }
        } else if (itemType === "reasoning") {
          const reasoning = (item?.text as string) || "";
          if (reasoning.trim().length > 0) {
            yield {
              type: "assistant",
              message: {
                id: itemId,
                content: [
                  {
                    type: "text",
                    text: reasoning,
                  },
                ],
              },
            };
          }
        } else if (
          itemType === "command_execution" ||
          itemType === "tool_call" ||
          itemType === "mcp_tool_call"
        ) {
          const output = extractCodexToolOutput(item);
          const exitCode =
            typeof item?.exit_code === "number" ? item.exit_code : undefined;
          const status =
            typeof item?.status === "string" ? item.status : undefined;
          const isError =
            typeof exitCode === "number"
              ? exitCode !== 0
              : status === "failed" || status === "error";

          yield {
            type: "user",
            message: {
              content: [
                {
                  type: "tool_result",
                  tool_use_id: itemId,
                  content: output,
                  is_error: isError || undefined,
                  status,
                  exit_code: exitCode,
                },
              ],
            },
          };
        }
        break;
      }
      case "turn.completed": {
        yield {
          type: "result",
          result: event.finalResponse ?? null,
          usage: event.usage,
        };
        break;
      }
      case "error": {
        yield {
          type: "error",
          error: event.error,
        };
        break;
      }
      default:
        break;
    }
  }
}

function createClaudeQuery(): BuildQueryFn {
  return (prompt, workingDirectory, systemPrompt) => {
    const sentryQuery = Sentry.createInstrumentedClaudeQuery();
    const systemPromptSegments = [CLAUDE_SYSTEM_PROMPT.trim()];
    if (systemPrompt && systemPrompt.trim().length > 0) {
      systemPromptSegments.push(systemPrompt.trim());
    }

    return sentryQuery({
      prompt,
      options: {
        model: CLAUDE_MODEL,
        cwd: workingDirectory,
        permissionMode: "default",
        maxTurns: 100,
        systemPrompt: systemPromptSegments.join("\n\n"),
        additionalDirectories: [workingDirectory],
        canUseTool: createProjectScopedPermissionHandler(workingDirectory),
      },
    });
  };
}

function createCodexQuery(): BuildQueryFn {
  return async function* codexQuery(prompt, workingDirectory, systemPrompt) {
    const codex = await createInstrumentedCodex({
      workingDirectory,
    });

    const systemParts: string[] = [CODEX_SYSTEM_PROMPT.trim()];
    if (systemPrompt && systemPrompt.trim().length > 0) {
      systemParts.push(systemPrompt.trim());
    }

    const combinedPrompt = `${systemParts.join('\n\n')}\n\n${prompt}`;

    const thread = codex.startThread({
      sandboxMode: "danger-full-access",
      model: CODEX_MODEL,
      workingDirectory,
      skipGitRepoCheck: true,
    });

    const { events } = await thread.runStreamed(combinedPrompt);

    for await (const agentMessage of convertCodexEventsToAgentMessages(events)) {
      yield agentMessage;
    }
  };
}

function createBuildQuery(agent: AgentId): BuildQueryFn {
  if (agent === "openai-codex") {
    return createCodexQuery();
  }
  return createClaudeQuery();
}

/**
 * Start the runner with the given options
 */
export function startRunner(options: RunnerOptions = {}) {
  const WORKSPACE_ROOT = options.workspace || getWorkspaceRoot();
  log("workspace root:", WORKSPACE_ROOT);

  const RUNNER_ID = options.runnerId || process.env.RUNNER_ID || os.hostname();
  const BROKER_URL =
    options.brokerUrl ||
    process.env.RUNNER_BROKER_URL ||
    "ws://localhost:4000/socket";
  const SHARED_SECRET =
    options.sharedSecret || process.env.RUNNER_SHARED_SECRET;
  const HEARTBEAT_INTERVAL_MS = options.heartbeatInterval || 15_000;

  if (!SHARED_SECRET) {
    console.error("RUNNER_SHARED_SECRET is required");
    throw new Error("RUNNER_SHARED_SECRET is required");
  }

  let socket: WebSocket | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let pingTimer: NodeJS.Timeout | null = null;
  let loggedFirstChunk = false;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_DELAY = 30000; // 30 seconds max
  const PING_INTERVAL = 30000; // Ping every 30 seconds

  // Track verified listening ports per project (single source of truth)
  const verifiedPortsByProject = new Map<string, number>();

  function assertNever(value: never): never {
    throw new Error(`Unhandled runner command: ${JSON.stringify(value)}`);
  }

  function sendEvent(event: RunnerEvent) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.warn(
        `[runner] Cannot send event ${event.type}: WebSocket not connected (state: ${socket?.readyState})`
      );
      return;
    }
    try {
      const eventJson = JSON.stringify(event);

      // Only log important events
      if (event.type === "error") {
        console.error(`[runner] ❌ Error: ${event.error}`);
        if (event.stack) {
          console.error(`[runner]   Stack: ${event.stack.substring(0, 500)}`);
        }
      } else if (event.type === "port-detected") {
        console.log(`[runner] 🔌 Port detected: ${event.port}`);
      } else if (event.type === "tunnel-created") {
        console.log(
          `[runner] 🔗 Tunnel created: ${event.tunnelUrl} -> localhost:${event.port}`
        );
      } else if (event.type === "build-completed") {
        console.log(
          `[runner] ✅ Build completed for project: ${event.projectId}`
        );
      } else if (event.type === "build-failed") {
        console.error(`[runner] ❌ Build failed: ${event.error}`);
      }
      // Suppress: build-stream, runner-status, ack, etc.

      socket.send(eventJson);
    } catch (error) {
      console.error(`[runner] ❌ Failed to send event ${event.type}:`, error);
    }
  }

  function buildEventBase(projectId?: string, commandId?: string) {
    return {
      projectId,
      commandId,
      timestamp: new Date().toISOString(),
    } as const;
  }

  async function handleCommand(command: RunnerCommand) {
    console.log(
      `[runner] 📥 Received command: ${command.type} for project: ${command.projectId}`
    );
    console.log(`[runner]   Command ID: ${command.id}`);
    console.log(`[runner]   Timestamp: ${command.timestamp}`);

    // Log command-specific details
    if (command.type === "start-build") {
      console.log(
        `[runner]   Build operation: ${command.payload.operationType}`
      );
      console.log(`[runner]   Project slug: ${command.payload.projectSlug}`);
      console.log(
        `[runner]   Prompt length: ${command.payload.prompt?.length || 0} chars`
      );
    } else if (command.type === "start-dev-server") {
      console.log(
        `[runner]   Working directory: ${command.payload.workingDirectory}`
      );
      console.log(`[runner]   Run command: ${command.payload.runCommand}`);
    } else if (
      command.type === "start-tunnel" ||
      command.type === "stop-tunnel"
    ) {
      console.log(`[runner]   Port: ${command.payload.port}`);
    }

    sendEvent({
      type: "ack",
      ...buildEventBase(command.projectId, command.id),
      message: `Command ${command.type} accepted`,
    });

    switch (command.type) {
      case "runner-health-check": {
        publishStatus(command.projectId, command.id);
        break;
      }
      case "start-dev-server": {
        try {
          const {
            runCommand: runCmd,
            workingDirectory,
            env = {},
            preferredPort,
            framework,
          } = command.payload;

          // Allocate port locally (await since it's now async)
          const allocatedPort = await allocatePort();

          // Build environment with framework-specific port variables
          const envVars = {
            ...process.env,
            ...env,
            PORT: String(allocatedPort),
            // Framework-specific port variables
            VITE_PORT: String(allocatedPort),
            ASTRO_PORT: String(allocatedPort),
          };

          const startTime = Date.now();

          const devProcess = startDevServer({
            projectId: command.projectId,
            command: runCmd,
            cwd: workingDirectory,
            env: envVars,
          });

          devProcess.emitter.on("log", (logEvent) => {
            sendEvent({
              type: "log-chunk",
              ...buildEventBase(command.projectId, command.id),
              stream: logEvent.type,
              data: logEvent.data,
              cursor: randomUUID(),
            });
          });

          devProcess.emitter.on("port", async (port: number) => {
            // Store VERIFIED listening port for this project (single source of truth)
            verifiedPortsByProject.set(command.projectId, port);
            console.log(
              `✅ Verified listening port ${port} for project ${command.projectId}`
            );

            // Send port-detected event immediately without tunnel
            // Tunnel creation is now manual via start-tunnel command
            sendEvent({
              type: "port-detected",
              ...buildEventBase(command.projectId, command.id),
              port,
              framework: framework ?? "unknown",
            });
          });

          devProcess.emitter.on("exit", async ({ code, signal }) => {
            // Use verified port for cleanup (single source of truth)
            const verifiedPort = verifiedPortsByProject.get(command.projectId);
            if (verifiedPort) {
              console.log(
                `🔗 Closing tunnel for verified port ${verifiedPort}`
              );
              await tunnelManager.closeTunnel(verifiedPort);
              verifiedPortsByProject.delete(command.projectId);
            }

            // Release allocated port from pool
            releasePort(allocatedPort);

            sendEvent({
              type: "process-exited",
              ...buildEventBase(command.projectId, command.id),
              exitCode: code ?? null,
              signal: signal ?? null,
              durationMs: Date.now() - startTime,
            });
          });

          devProcess.emitter.on("error", (error: unknown) => {
            sendEvent({
              type: "error",
              ...buildEventBase(command.projectId, command.id),
              error:
                error instanceof Error ? error.message : "Unknown runner error",
              stack: error instanceof Error ? error.stack : undefined,
            });
          });
        } catch (error) {
          console.error("Failed to start dev server", error);
          sendEvent({
            type: "error",
            ...buildEventBase(command.projectId, command.id),
            error:
              error instanceof Error
                ? error.message
                : "Failed to start dev server",
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
        break;
      }
      case "stop-dev-server": {
        const stopped = stopDevServer(command.projectId);
        if (!stopped) {
          sendEvent({
            type: "error",
            ...buildEventBase(command.projectId, command.id),
            error: "No running dev server found for project",
          });
        }
        break;
      }
      case "start-tunnel": {
        try {
          const { port } = command.payload;
          console.log(`🔗 Starting tunnel for port ${port}...`);

          // Wait for the port to be ready before creating tunnel
          console.log(`⏳ Waiting for port ${port} to be ready...`);
          const isReady = await waitForPort(port, 15, 1000); // 15 retries, 1s apart = max 15s

          if (!isReady) {
            throw new Error(`Port ${port} is not ready or not accessible`);
          }

          // Create tunnel
          const tunnelUrl = await tunnelManager.createTunnel(port);
          console.log(`✅ Tunnel created: ${tunnelUrl} → localhost:${port}`);

          sendEvent({
            type: "tunnel-created",
            ...buildEventBase(command.projectId, command.id),
            port,
            tunnelUrl,
          });
        } catch (error) {
          console.error("Failed to create tunnel:", error);
          sendEvent({
            type: "error",
            ...buildEventBase(command.projectId, command.id),
            error:
              error instanceof Error
                ? error.message
                : "Failed to create tunnel",
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
        break;
      }
      case "stop-tunnel": {
        try {
          const { port } = command.payload;
          console.log(`🔗 Stopping tunnel for port ${port}...`);
          await tunnelManager.closeTunnel(port);
          console.log(`✅ Tunnel closed for port ${port}`);

          sendEvent({
            type: "tunnel-closed",
            ...buildEventBase(command.projectId, command.id),
            port,
          });
        } catch (error) {
          console.error("Failed to close tunnel:", error);
          sendEvent({
            type: "error",
            ...buildEventBase(command.projectId, command.id),
            error:
              error instanceof Error ? error.message : "Failed to close tunnel",
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
        break;
      }
      case "fetch-logs": {
        log("fetch-logs not yet implemented");
        sendEvent({
          type: "error",
          ...buildEventBase(command.projectId, command.id),
          error: "fetch-logs not yet implemented in prototype",
        });
        break;
      }
      case "delete-project-files": {
        try {
          const { slug } = command.payload;
          const projectPath = join(WORKSPACE_ROOT, slug);

          console.log(`[runner] 🗑️  Deleting project files for slug: ${slug}`);
          console.log(`[runner]   Path: ${projectPath}`);

          // First, stop any running dev server for this project to release file locks
          const wasStopped = stopDevServer(command.projectId);
          if (wasStopped) {
            console.log(`[runner]   Stopped dev server before deletion`);
            // Wait a bit for processes to fully exit and release file locks
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }

          // Use multiple strategies for robust deletion
          const { spawn } = await import("child_process");
          const { promisify } = await import("util");

          // Strategy 1: Try using /bin/rm -rf with full path to rm binary
          try {
            await new Promise<void>((resolve, reject) => {
              const proc = spawn("/bin/rm", ["-rf", projectPath], {
                stdio: "pipe",
              });

              let stderr = "";
              proc.stderr?.on("data", (data) => {
                stderr += data.toString();
              });

              proc.on("exit", (code) => {
                if (code === 0) {
                  resolve();
                } else {
                  reject(new Error(`rm exited with code ${code}: ${stderr}`));
                }
              });

              proc.on("error", reject);
            });

            console.log(
              `[runner] ✅ Successfully deleted project files: ${projectPath}`
            );
          } catch (rmError) {
            console.warn(
              `[runner] ⚠️  rm -rf failed, trying fs.rm with maxRetries...`
            );

            // Strategy 2: Fall back to fs.rm with maxRetries option
            const { rm } = await import("fs/promises");
            await rm(projectPath, {
              recursive: true,
              force: true,
              maxRetries: 3,
              retryDelay: 500,
            });

            console.log(
              `[runner] ✅ Successfully deleted project files with fs.rm`
            );
          }

          sendEvent({
            type: "files-deleted",
            ...buildEventBase(command.projectId, command.id),
            slug,
          });
        } catch (error) {
          console.error("[runner] ❌ Failed to delete project files:", error);
          sendEvent({
            type: "error",
            ...buildEventBase(command.projectId, command.id),
            error:
              error instanceof Error
                ? error.message
                : "Failed to delete project files",
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
        break;
      }
      case "read-file": {
        try {
          const { slug, filePath } = command.payload;
          const projectPath = join(WORKSPACE_ROOT, slug);
          const fullPath = join(projectPath, filePath);

          console.log(
            `[runner] 📖 Reading file: ${filePath} from project: ${slug}`
          );

          // Security: Ensure path is within project directory
          if (!fullPath.startsWith(projectPath)) {
            throw new Error("Invalid file path - outside project directory");
          }

          const { readFile, stat } = await import("fs/promises");
          const stats = await stat(fullPath);
          const content = await readFile(fullPath, "utf-8");

          console.log(
            `[runner] ✅ File read successfully (${stats.size} bytes)`
          );

          sendEvent({
            type: "file-content",
            ...buildEventBase(command.projectId, command.id),
            slug,
            filePath,
            content,
            size: stats.size,
          });
        } catch (error) {
          console.error("[runner] ❌ Failed to read file:", error);
          sendEvent({
            type: "error",
            ...buildEventBase(command.projectId, command.id),
            error:
              error instanceof Error ? error.message : "Failed to read file",
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
        break;
      }
      case "write-file": {
        try {
          const { slug, filePath, content } = command.payload;
          const projectPath = join(WORKSPACE_ROOT, slug);
          const fullPath = join(projectPath, filePath);

          console.log(
            `[runner] 💾 Writing file: ${filePath} to project: ${slug}`
          );

          // Security: Ensure path is within project directory
          if (!fullPath.startsWith(projectPath)) {
            throw new Error("Invalid file path - outside project directory");
          }

          const { writeFile } = await import("fs/promises");
          await writeFile(fullPath, content, "utf-8");

          console.log(
            `[runner] ✅ File written successfully (${content.length} bytes)`
          );

          sendEvent({
            type: "file-written",
            ...buildEventBase(command.projectId, command.id),
            slug,
            filePath,
          });
        } catch (error) {
          console.error("[runner] ❌ Failed to write file:", error);
          sendEvent({
            type: "error",
            ...buildEventBase(command.projectId, command.id),
            error:
              error instanceof Error ? error.message : "Failed to write file",
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
        break;
      }
      case "list-files": {
        try {
          const { slug, path: subPath } = command.payload;
          const projectPath = join(WORKSPACE_ROOT, slug);
          const targetPath = subPath ? join(projectPath, subPath) : projectPath;

          console.log(`[runner] 📁 Listing files for project: ${slug}`);
          console.log(`[runner]   Path: ${targetPath}`);

          // Security: Ensure path is within project directory
          if (!targetPath.startsWith(projectPath)) {
            throw new Error("Invalid path - outside project directory");
          }

          const { readdir, stat } = await import("fs/promises");
          const entries = await readdir(targetPath);

          const files = await Promise.all(
            entries.map(async (name) => {
              const entryPath = join(targetPath, name);
              const relativePath = subPath ? join(subPath, name) : name;
              const stats = await stat(entryPath);

              return {
                name,
                type: stats.isDirectory()
                  ? ("directory" as const)
                  : ("file" as const),
                path: relativePath,
                size: stats.isFile() ? stats.size : undefined,
              };
            })
          );

          console.log(`[runner] ✅ Found ${files.length} entries`);

          sendEvent({
            type: "file-list",
            ...buildEventBase(command.projectId, command.id),
            slug,
            files,
          });
        } catch (error) {
          console.error("[runner] ❌ Failed to list files:", error);
          sendEvent({
            type: "error",
            ...buildEventBase(command.projectId, command.id),
            error:
              error instanceof Error ? error.message : "Failed to list files",
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
        break;
      }
      case "start-build": {
        try {
          loggedFirstChunk = false;
          if (!command.payload?.prompt || !command.payload?.operationType) {
            throw new Error("Invalid build payload");
          }

          // Calculate the project directory using slug
          const projectSlug = command.payload.projectSlug || command.projectId;
          const projectName = command.payload.projectName || projectSlug;
          const projectDirectory = resolve(WORKSPACE_ROOT, projectSlug);

          log("project directory:", projectDirectory);
          log("project slug:", projectSlug);
          log("project name:", projectName);

          // Determine agent to use for this build
          const agent = (command.payload.agent as AgentId | undefined) ?? DEFAULT_AGENT;
          const agentLabel = agent === "openai-codex" ? "Codex" : "Claude";
          log("selected agent:", agent);

          const agentQuery = createBuildQuery(agent);

          // Reset transformer state for new build
          resetTransformerState();
          setExpectedCwd(projectDirectory);

          // Orchestrate the build - handle templates, generate dynamic prompt
          log("orchestrating build...");
          const orchestration = await orchestrateBuild({
            projectId: command.projectId,
            projectName: projectSlug,
            prompt: command.payload.prompt,
            operationType: command.payload.operationType,
            workingDirectory: projectDirectory,
          });

          log("orchestration complete:", {
            isNewProject: orchestration.isNewProject,
            hasTemplate: !!orchestration.template,
            templateEventsCount: orchestration.templateEvents.length,
            hasMetadata: !!orchestration.projectMetadata,
          });

          // Send project metadata if available (template download sets path, runCommand, etc.)
          if (orchestration.projectMetadata) {
            sendEvent({
              type: "project-metadata",
              ...buildEventBase(command.projectId, command.id),
              payload: orchestration.projectMetadata,
            } as RunnerEvent);
          }

          // Send template events (TodoWrite for template selection/download)
          for (const templateEvent of orchestration.templateEvents) {
            const payload = `data: ${JSON.stringify(templateEvent.data)}\n\n`;
            sendEvent({
              type: "build-stream",
              ...buildEventBase(command.projectId, command.id),
              data: payload,
            });
          }

          console.log(
            `[build] 🚀 Starting build stream for project: ${command.projectId}`
          );
          console.log(`[build]   Directory: ${projectDirectory}`);
          console.log(
            `[build]   Is new project: ${orchestration.isNewProject}`
          );
          console.log(
            `[build]   Template: ${orchestration.template?.name || "none"}`
          );

          const stream = await createBuildStream({
            projectId: command.projectId,
            prompt: orchestration.fullPrompt,
            operationType: command.payload.operationType,
            context: command.payload.context,
            query: agentQuery,
            workingDirectory: projectDirectory,
            systemPrompt: orchestration.systemPrompt,
            agent,
          });

          console.log(
            `[build] 📡 Build stream created, starting to process chunks...`
          );

          const reader = stream.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value === undefined || value === null) continue;

            // Decode the chunk to get the agent message object
            let agentMessage: unknown;
            if (typeof value === "string") {
              try {
                agentMessage = JSON.parse(value);
              } catch {
                agentMessage = { raw: value };
              }
            } else if (value instanceof Uint8Array) {
              const text = decoder.decode(value, { stream: true });
              try {
                agentMessage = JSON.parse(text);
              } catch {
                agentMessage = { raw: text };
              }
            } else if (ArrayBuffer.isView(value)) {
              const view = value as ArrayBufferView;
              const text = decoder.decode(
                new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
                { stream: true }
              );
              try {
                agentMessage = JSON.parse(text);
              } catch {
                agentMessage = { raw: text };
              }
            } else if (value instanceof ArrayBuffer) {
              const text = decoder.decode(new Uint8Array(value), {
                stream: true,
              });
              try {
                agentMessage = JSON.parse(text);
              } catch {
                agentMessage = { raw: text };
              }
            } else if (typeof value === "object") {
              agentMessage = value;
            } else {
              console.warn(
                "Unsupported chunk type from build stream:",
                typeof value
              );
              continue;
            }

            if (!loggedFirstChunk) {
              console.log(
                `[build] 📨 First chunk received from ${agentLabel}`
              );
              console.log("[build] 🔥🔥🔥 NEW LOGGING CODE IS ACTIVE 🔥🔥🔥");
              loggedFirstChunk = true;
            }

            // Log generation and tool usage
            if (typeof agentMessage === 'object' && agentMessage !== null) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const msg = agentMessage as any;

              // The actual message is nested in a 'message' property
              const actualMessage = msg.message || msg;

              // Handle assistant messages (conversation turn format)
              if (msg.type === 'assistant' && actualMessage.content && Array.isArray(actualMessage.content)) {
                for (const block of actualMessage.content) {
                  // Log text content
                  if (block.type === 'text' && block.text) {
                    console.log(`[build] 💭 ${agentLabel}: ${block.text.slice(0, 200)}${block.text.length > 200 ? '...' : ''}`);
                  }

                  // Log thinking blocks
                  if (block.type === 'thinking' && block.thinking) {
                    console.log(`[build] 🤔 Thinking: ${block.thinking.slice(0, 300)}${block.thinking.length > 300 ? '...' : ''}`);
                  }

                  // Log tool use
                  if (block.type === 'tool_use') {
                    const toolName = block.name;
                    const toolId = block.id;
                    const input = JSON.stringify(block.input, null, 2);
                    console.log(`[build] 🔧 Tool called: ${toolName} (${toolId})`);
                    console.log(`[build]    Input: ${input.slice(0, 300)}${input.length > 300 ? '...' : ''}`);
                  }
                }
              }

              // Handle user messages (tool results)
              if (msg.type === 'user' && actualMessage.content && Array.isArray(actualMessage.content)) {
                for (const block of actualMessage.content) {
                  if (block.type === 'tool_result') {
                    const toolId = block.tool_use_id;
                    const isError = block.is_error;

                    // Handle different content formats
                    let content = '';
                    if (typeof block.content === 'string') {
                      content = block.content;
                    } else if (Array.isArray(block.content)) {
                      // Content might be an array of content blocks
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      content = block.content.map((c: any) => {
                        if (c.type === 'text') return c.text;
                        return JSON.stringify(c);
                      }).join('\n');
                    } else {
                      content = JSON.stringify(block.content);
                    }

                    if (isError) {
                      console.error(`[build] ❌ Tool error (${toolId}):`);
                      console.error(`[build]    ${content.slice(0, 500)}${content.length > 500 ? '...' : ''}`);
                    } else {
                      console.log(`[build] ✅ Tool result (${toolId}):`);
                      console.log(`[build]    ${content.slice(0, 500)}${content.length > 500 ? '...' : ''}`);
                    }
                  }
                }
              }
            }

            // Transform agent message to SSE events
            const sseEvents = transformAgentMessageToSSE(agentMessage);

            // Send each transformed event
            for (const event of sseEvents) {
              const payload = `data: ${JSON.stringify(event)}\n\n`;
              sendEvent({
                type: "build-stream",
                ...buildEventBase(command.projectId, command.id),
                data: payload,
              });
            }
          }

          const finalChunk = decoder.decode();
          if (finalChunk) {
            let payload = finalChunk.startsWith("data:")
              ? finalChunk
              : `data: ${finalChunk}`;
            if (!payload.endsWith("\n\n")) {
              payload = `${payload}\n\n`;
            }
            sendEvent({
              type: "build-stream",
              ...buildEventBase(command.projectId, command.id),
              data: payload,
            });
          }

          sendEvent({
            type: "build-stream",
            ...buildEventBase(command.projectId, command.id),
            data: "data: [DONE]\n\n",
          });

          // Detect runCommand from built project's package.json
          try {
            const { readFileSync, existsSync } = await import("fs");
            const packageJsonPath = join(projectDirectory, "package.json");

            if (existsSync(packageJsonPath)) {
              const packageJson = JSON.parse(
                readFileSync(packageJsonPath, "utf-8")
              );
              let runCommand = null;

              if (packageJson.scripts?.dev) {
                runCommand = "npm run dev";
              } else if (packageJson.scripts?.start) {
                runCommand = "npm start";
              }

              if (runCommand) {
                // Send project-metadata event with detected runCommand
                sendEvent({
                  type: "project-metadata",
                  ...buildEventBase(command.projectId, command.id),
                  payload: {
                    path: projectDirectory,
                    projectType: "unknown",
                    runCommand,
                    port: 3000,
                  },
                } as RunnerEvent);

                console.log(`✅ Detected runCommand: ${runCommand}`);
              }
            }
          } catch (error) {
            console.warn("Failed to detect runCommand:", error);
          }

          console.log(
            `[build] ✅ Build completed successfully for project: ${command.projectId}`
          );
          console.log(`[build]   Total chunks processed: (stream ended)`);

          sendEvent({
            type: "build-completed",
            ...buildEventBase(command.projectId, command.id),
            payload: { todos: [], summary: "Build completed" },
          });
        } catch (error) {
          console.error("Failed to run build", error);
          sendEvent({
            type: "build-failed",
            ...buildEventBase(command.projectId, command.id),
            error:
              error instanceof Error ? error.message : "Failed to run build",
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
        break;
      }
      default:
        assertNever(command as never);
    }
  }

  function publishStatus(projectId?: string, commandId?: string) {
    const uptimeSeconds = Math.round(process.uptime());
    const load = os.loadavg?.()[0];

    sendEvent({
      type: "runner-status",
      ...buildEventBase(projectId, commandId),
      payload: {
        status: "online",
        version: "prototype",
        hostname: os.hostname(),
        platform: os.platform(),
        uptimeSeconds,
        load,
      },
    });
  }

  function scheduleHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
    heartbeatTimer = setInterval(() => publishStatus(), HEARTBEAT_INTERVAL_MS);
  }

  function connect() {
    const url = new URL(BROKER_URL);
    url.searchParams.set("runnerId", RUNNER_ID);

    socket = new WebSocket(url.toString(), {
      headers: {
        Authorization: `Bearer ${SHARED_SECRET}`,
      },
    });

    socket.on("open", () => {
      reconnectAttempts = 0; // Reset on successful connection
      log("connected to broker", url.toString());
      publishStatus();
      scheduleHeartbeat();

      // Start ping/pong to keep connection alive
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.ping();
        }
      }, PING_INTERVAL);
    });

    socket.on("message", (data: WebSocket.RawData) => {
      Sentry.startSpan(
        {
          op: "function",
          name: "SentryVibe Build Runner",
          forceTransaction: true,
        },
        (span: Sentry.Span) => {
          try {
            const command = JSON.parse(String(data)) as RunnerCommand;
            handleCommand(command);
          } catch (error) {
            console.error("Failed to parse command", error);
            sendEvent({
              type: "error",
              ...buildEventBase(undefined, randomUUID()),
              error: "Failed to parse command payload",
              stack: error instanceof Error ? error.stack : undefined,
            });
            span.setStatus({
              code: 2,
              message: "Failed to parse command payload",
            });
          }
        }
      );
    });

    socket.on("close", (code: number, reason: Buffer) => {
      const reasonStr = reason.toString() || 'no reason provided';
      log(`connection closed with code ${code}, reason: ${reasonStr}`);

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }

      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }

      // Exponential backoff with max delay
      reconnectAttempts++;
      const delay = Math.min(
        1000 * Math.pow(2, reconnectAttempts - 1), // 1s, 2s, 4s, 8s, 16s...
        MAX_RECONNECT_DELAY
      );

      log(`reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`);
      setTimeout(connect, delay);
    });

    socket.on("pong", () => {
      // Connection is alive
    });

    socket.on("error", (error: Error) => {
      console.error("socket error", error);
    });
  }

  process.on("SIGINT", async () => {
    log("shutting down");
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (pingTimer) clearInterval(pingTimer);

    // Cleanup all tunnels
    await tunnelManager.closeAll();

    // Flush Sentry events before exiting
    await Sentry.flush(2000);

    socket?.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    log("shutting down (SIGTERM)");
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (pingTimer) clearInterval(pingTimer);

    // Cleanup all tunnels
    await tunnelManager.closeAll();

    // Flush Sentry events before exiting
    await Sentry.flush(2000);

    socket?.close();
    process.exit(0);
  });

  connect();
}

// If running this file directly, start the runner
// ESM equivalent of: if (require.main === module)
if (import.meta.url === `file://${process.argv[1]}`) {
  startRunner();
}
