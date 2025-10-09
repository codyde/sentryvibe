import "./instrument";
import * as Sentry from "@sentry/node";
import { config as loadEnv } from "dotenv";
import { resolve, join } from "path";

loadEnv({ path: resolve(__dirname, "../.env") });
// loadEnv({ path: resolve(__dirname, '../.env.local'), override: true });
import WebSocket from "ws";
import os from "os";
import { randomUUID } from "crypto";
import type { RunnerCommand, RunnerEvent } from "./shared/runner/messages";
import { createBuildStream } from "./lib/build/engine";
import { startDevServer, stopDevServer } from "./lib/process-manager";
import { getWorkspaceRoot } from "./lib/workspace";
import {
  transformAgentMessageToSSE,
  resetTransformerState,
  setExpectedCwd,
} from "./lib/message-transformer";
import { orchestrateBuild } from "./lib/build-orchestrator";
import { tunnelManager } from "./lib/tunnel/manager";
import { allocatePort, releasePort } from "./lib/port-allocator";

Sentry.startSpan(
  {
    op: "worker",
    name: `vibe-runner`,
  },
  () => {
    const log = (...args: unknown[]) => {
      console.log("[runner]", ...args);
    };

    const WORKSPACE_ROOT = getWorkspaceRoot();
    log("workspace root:", WORKSPACE_ROOT);

    const RUNNER_ID = process.env.RUNNER_ID ?? os.hostname();
    const BROKER_URL =
      process.env.RUNNER_BROKER_URL ?? "ws://localhost:4000/socket";
    const SHARED_SECRET = process.env.RUNNER_SHARED_SECRET;
    const HEARTBEAT_INTERVAL_MS = 15_000;

    // Create the build query function that will be called with (prompt, workingDirectory, systemPrompt)
    const buildQuery = (...args: unknown[]) => {
      return Sentry.startSpan(
        {
          op: "function",
          name: `buildQuery`,
        },
        () => {
          const sentryQuery = Sentry.createInstrumentedClaudeQuery();
          const [prompt, workingDir, systemPrompt] = args;
          return sentryQuery({
            prompt: prompt as string,
            options: {
              model: "claude-sonnet-4-5",
              cwd: workingDir as string,
              permissionMode: "bypassPermissions",
              maxTurns: 100,
              systemPrompt: systemPrompt as string,
            },
          });
        }
      );
    };

    if (!SHARED_SECRET) {
      console.error("RUNNER_SHARED_SECRET is required");
      process.exit(1);
    }

    let socket: WebSocket | null = null;
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let loggedFirstChunk = false;

    function assertNever(value: never): never {
      throw new Error(`Unhandled runner command: ${JSON.stringify(value)}`);
    }

    function sendEvent(event: RunnerEvent) {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      socket.send(JSON.stringify(event));
    }

    function buildEventBase(projectId?: string, commandId?: string) {
      return {
        projectId,
        commandId,
        timestamp: new Date().toISOString(),
      } as const;
    }

    async function handleCommand(command: RunnerCommand) {
      log("command received", command.type, { projectId: command.projectId });

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

            // Allocate port locally (avoid reserved ports like 6000)
            const allocatedPort = allocatePort();

            const envVars = {
              ...process.env,
              ...env,
              PORT: String(allocatedPort),
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
              try {
                // Automatically create tunnel for this port
                console.log(`🔗 Creating tunnel for port ${port}...`);
                const tunnelUrl = await tunnelManager.createTunnel(port);

                sendEvent({
                  type: "port-detected",
                  ...buildEventBase(command.projectId, command.id),
                  port,
                  tunnelUrl,
                  framework: framework ?? "unknown",
                });
              } catch (error) {
                console.error("Failed to create tunnel:", error);
                // Still send port-detected without tunnel URL
                sendEvent({
                  type: "port-detected",
                  ...buildEventBase(command.projectId, command.id),
                  port,
                  framework: framework ?? "unknown",
                });
              }
            });

            devProcess.emitter.on("exit", async ({ code, signal }) => {
              // Cleanup tunnel and release port
              await tunnelManager.closeTunnel(allocatedPort);
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
                  error instanceof Error
                    ? error.message
                    : "Unknown runner error",
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
        case "fetch-logs": {
          log("fetch-logs not yet implemented");
          sendEvent({
            type: "error",
            ...buildEventBase(command.projectId, command.id),
            error: "fetch-logs not yet implemented in prototype",
          });
          break;
        }
        case "start-build": {
          try {
            loggedFirstChunk = false;
            if (!command.payload?.prompt || !command.payload?.operationType) {
              throw new Error("Invalid build payload");
            }

            // Calculate the project directory using slug
            const projectSlug =
              command.payload.projectSlug || command.projectId;
            const projectName = command.payload.projectName || projectSlug;
            const projectDirectory = resolve(WORKSPACE_ROOT, projectSlug);

            log("project directory:", projectDirectory);
            log("project slug:", projectSlug);
            log("project name:", projectName);

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

            const stream = await createBuildStream({
              projectId: command.projectId,
              prompt: orchestration.fullPrompt,
              operationType: command.payload.operationType,
              context: command.payload.context,
              query: buildQuery,
              workingDirectory: projectDirectory,
              systemPrompt: orchestration.systemPrompt,
            });

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
                  "[runner] first build chunk sample:",
                  JSON.stringify(agentMessage).slice(0, 200)
                );
                loggedFirstChunk = true;
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
              const { readFileSync, existsSync } = await import('fs');
              const packageJsonPath = join(projectDirectory, 'package.json');

              if (existsSync(packageJsonPath)) {
                const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
                let runCommand = null;

                if (packageJson.scripts?.dev) {
                  runCommand = 'npm run dev';
                } else if (packageJson.scripts?.start) {
                  runCommand = 'npm start';
                }

                if (runCommand) {
                  // Send project-metadata event with detected runCommand
                  sendEvent({
                    type: "project-metadata",
                    ...buildEventBase(command.projectId, command.id),
                    payload: {
                      path: projectDirectory,
                      projectType: 'unknown',
                      runCommand,
                      port: 3000,
                    },
                  } as RunnerEvent);

                  console.log(`✅ Detected runCommand: ${runCommand}`);
                }
              }
            } catch (error) {
              console.warn('Failed to detect runCommand:', error);
            }

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
          assertNever(command);
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
      heartbeatTimer = setInterval(
        () => publishStatus(),
        HEARTBEAT_INTERVAL_MS
      );
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
        log("connected to broker", url.toString());
        publishStatus();
        scheduleHeartbeat();
      });

      socket.on("message", (data: WebSocket.RawData) => {
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
        }
      });

      socket.on("close", (code: number) => {
        log("connection closed", code);
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        setTimeout(connect, 2000);
      });

      socket.on("error", (error: Error) => {
        console.error("socket error", error);
      });
    }

    process.on("SIGINT", async () => {
      log("shutting down");
      if (heartbeatTimer) clearInterval(heartbeatTimer);

      // Cleanup all tunnels
      await tunnelManager.closeAll();

      socket?.close();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      log("shutting down (SIGTERM)");
      if (heartbeatTimer) clearInterval(heartbeatTimer);

      // Cleanup all tunnels
      await tunnelManager.closeAll();

      socket?.close();
      process.exit(0);
    });

    connect();
  }
);
