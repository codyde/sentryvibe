// Note: Vendor packages are initialized by cli/index.ts before this module loads
// This ensures agent-core is available for imports

// File logger for debugging (always works, bypasses TUI)
import { fileLog } from './lib/file-logger.js';

// VERSION CHECK - This will log immediately when module loads
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🚀 RUNNER INDEX.TS LOADED - AI SDK VERSION');
console.log('   Built at:', new Date().toISOString());
console.log('   This proves the new code is running');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

fileLog.info('Runner module loaded - AI SDK VERSION');
fileLog.info('Built at:', new Date().toISOString());

import "./instrument.js";
import * as Sentry from "@sentry/node";
import { config as loadEnv } from "dotenv";
import { resolve, join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

loadEnv({ path: resolve(__dirname, "../.env.local"), override: true });

// Disable AI SDK warnings globally
process.env.AI_SDK_LOG_WARNINGS = 'false';

// AI SDK imports
import { streamText } from 'ai';
import { claudeCode } from 'ai-sdk-provider-claude-code';

// Codex SDK import (NOT AI SDK - using original Codex SDK)
import { createInstrumentedCodex } from '@sentry/node';

import WebSocket from "ws";
import os from "os";
import { randomUUID } from "crypto";
import {
  CLAUDE_SYSTEM_PROMPT, // UNIFIED: Used for both Claude and Codex
  DEFAULT_CLAUDE_MODEL_ID,
  type RunnerCommand,
  type RunnerEvent,
  type AgentId,
  type ClaudeModelId,
  setTemplatesPath,
} from "@sentryvibe/agent-core";
import type { TodoItem } from "@sentryvibe/agent-core/types/generation";
// Use dynamic import for buildLogger to work around CommonJS/ESM interop
import { buildLogger } from "@sentryvibe/agent-core/lib/logging/build-logger";
import { createBuildStream } from "./lib/build/engine.js";

// Configure templates.json path for this runner app
setTemplatesPath(resolve(__dirname, "../templates.json"));
import { startDevServer, stopDevServer } from "./lib/process-manager.js";
import { getWorkspaceRoot } from "./lib/workspace.js";
import {
  transformAgentMessageToSSE,
  resetTransformerState,
  setExpectedCwd,
} from "./lib/message-transformer.js";
import { transformAISDKStream } from "./lib/ai-sdk-adapter.js";
import { transformCodexStream } from "./lib/codex-sdk-adapter.js";
import {
  createSmartTracker,
  isComplete as isTrackerComplete,
  getCurrentTask,
  type SmartTodoTracker,
} from "./lib/smart-todo-tracker.js";
import { getTaskPlanJsonSchema } from "./lib/codex-task-schema.js";
import { orchestrateBuild } from "./lib/build-orchestrator.js";
import { tunnelManager } from "./lib/tunnel/manager.js";
import { waitForPort } from "./lib/port-checker.js";
import { createProjectScopedPermissionHandler } from "./lib/permissions/project-scoped-handler.js";

export interface RunnerOptions {
  brokerUrl?: string;
  apiUrl?: string;
  sharedSecret?: string;
  runnerId?: string;
  workspace?: string;
  heartbeatInterval?: number;
  silent?: boolean; // Suppress console output (for TUI mode)
}

let isSilentMode = false;

// Build logging can be controlled separately
const DEBUG_BUILD = process.env.DEBUG_BUILD === '1' || false;

const log = (...args: unknown[]) => {
  // Always log with [runner] prefix for TUI routing
  console.log("[runner]", ...args);
};

const buildLog = (...args: unknown[]) => {
  // Always log build events (removed silent mode check)
  console.log("[runner] [build]", ...args);
};

const DEFAULT_AGENT: AgentId = "claude-code";
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

function resolveCodexItemType(
  item: Record<string, unknown> | undefined
): string {
  if (!item) return "";
  if (typeof item.type === "string") return item.type;
  if (typeof (item as { item_type?: unknown }).item_type === "string") {
    return String((item as { item_type?: unknown }).item_type);
  }
  return "";
}

function resolveCodexItemId(item: Record<string, unknown> | undefined): string {
  if (!item) return randomUUID();
  const candidateKeys = [
    "id",
    "item_id",
    "tool_call_id",
    "tool_use_id",
  ] as const;
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
  let eventCount = 0;
  for await (const rawEvent of events) {
    eventCount++;
    const event = rawEvent as CodexEvent;

    // Log every single raw event from Codex
    console.log(
      `[codex-events] ═══════════════════════════════════════════════`
    );
    if (!isSilentMode && DEBUG_BUILD) console.log(`[codex-events] RAW EVENT #${eventCount}`);
    if (!isSilentMode && DEBUG_BUILD) console.log(`[codex-events] Type: ${event.type}`);
    if (!isSilentMode && DEBUG_BUILD) console.log(`[codex-events] Full event: ${JSON.stringify(event, null, 2)}`);
    console.log(
      `[codex-events] ═══════════════════════════════════════════════`
    );

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
                      (item?.command as string) || (item?.cmd as string) || "",
                  },
                },
              ],
            },
          };
        } else if (itemType === "file_change") {
          // Convert file_change events to tool_use for UI display
          const changes = (item?.changes as { kind: string; path: string }[]) || [];
          const filePaths = changes.map((c) => c.path || "unknown").join(", ");
          yield {
            type: "assistant",
            message: {
              id: itemId,
              content: [
                {
                  type: "tool_use",
                  id: itemId,
                  name: "file_change",
                  input: {
                    changes: changes,
                    summary: `Modified ${changes.length} file(s): ${filePaths}`,
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
          itemType === "mcp_tool_call" ||
          itemType === "file_change"
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

          // For file_change, create a more readable output
          let finalOutput = output;
          if (itemType === "file_change" && !output) {
            const changes = (item?.changes as { kind: string; path: string }[]) || [];
            finalOutput = changes
              .map((c) => `${c.kind || "modified"}: ${c.path}`)
              .join("\n");
          }

          yield {
            type: "user",
            message: {
              content: [
                {
                  type: "tool_result",
                  tool_use_id: itemId,
                  content: finalOutput,
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

/**
 * Create Claude query function using AI SDK
 *
 * NOTE: This function prepends CLAUDE_SYSTEM_PROMPT to the systemPrompt from orchestrator.
 * The orchestrator provides context-specific sections only (no base prompt).
 */
function createClaudeQuery(modelId: ClaudeModelId = DEFAULT_CLAUDE_MODEL_ID): BuildQueryFn {
  return async function* (prompt, workingDirectory, systemPrompt) {
    process.stderr.write('[runner] [createClaudeQuery] 🎯 Query function called\n');
    process.stderr.write(`[runner] [createClaudeQuery] Model: ${modelId}\n`);
    process.stderr.write(`[runner] [createClaudeQuery] Working dir: ${workingDirectory}\n`);
    process.stderr.write(`[runner] [createClaudeQuery] Prompt length: ${prompt.length}\n`);

    // Build combined system prompt
    const systemPromptSegments = [CLAUDE_SYSTEM_PROMPT.trim()];
    if (systemPrompt && systemPrompt.trim().length > 0) {
      systemPromptSegments.push(systemPrompt.trim());
    }
    const combinedSystemPrompt = systemPromptSegments.join("\n\n");

    // Map ClaudeModelId to AI SDK model IDs
    const modelIdMap: Record<string, string> = {
      'claude-haiku-4-5': 'haiku',
      'claude-sonnet-4-5': 'sonnet',
    };
    const aiSdkModelId = modelIdMap[modelId] || 'sonnet';

    // Create model with settings
    // DON'T set pathToClaudeCodeExecutable - let it use bundled cli.js from node_modules
    // NOTE: Sentry instrumentation happens automatically via claudeCodeIntegration()
    // No need to manually wrap query function - the integration patches it
    const model = claudeCode(aiSdkModelId, {
      systemPrompt: combinedSystemPrompt,
      cwd: workingDirectory,
      permissionMode: "default",
      maxTurns: 100,
      additionalDirectories: [workingDirectory],
      canUseTool: createProjectScopedPermissionHandler(workingDirectory),
      streamingInput: 'always', // REQUIRED when using canUseTool - enables tool callbacks
      settingSources: ['project', 'local'], // Load project-level settings
    });

    // Stream with telemetry enabled for Sentry
    const result = streamText({
      model,
      prompt,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
      },
    });

    // Transform AI SDK stream format to our message format
    if (process.env.DEBUG_BUILD === '1') {
      console.log('[createClaudeQuery] Starting stream consumption...');
    }

    for await (const message of transformAISDKStream(result.fullStream)) {
      if (process.env.DEBUG_BUILD === '1') {
        console.log('[createClaudeQuery] Yielding message:', message.type);
      }
      yield message;
    }

    if (process.env.DEBUG_BUILD === '1') {
      console.log('[createClaudeQuery] Stream consumption complete');
    }
  };
}

/**
 * Create Codex query function using ORIGINAL Codex SDK (NOT AI SDK)
 *
 * NOTE: This function prepends CLAUDE_SYSTEM_PROMPT to the systemPrompt from orchestrator.
 * UNIFIED: Both Claude and Codex now use the same base prompt for consistency.
 * The orchestrator provides context-specific sections only (no base prompt).
 *
 * Uses two-phase execution:
 * 1. Planning phase: Get structured task list with JSON schema
 * 2. Execution phase: Work through tasks sequentially
 */
function createCodexQuery(): BuildQueryFn {
  return async function* codexQuery(prompt, workingDirectory, systemPrompt) {
    buildLogger.codexQuery.promptBuilding(
      workingDirectory,
      CLAUDE_SYSTEM_PROMPT.length + (systemPrompt?.length || 0),
      prompt.length
    );

    fileLog.info('━━━ CODEX QUERY STARTED ━━━');
    fileLog.info('Working directory:', workingDirectory);
    fileLog.info('Prompt length:', prompt.length);

    const codex = await createInstrumentedCodex({
      apiKey: process.env.OPENAI_API_KEY,
      workingDirectory,
    });

    const systemParts: string[] = [CLAUDE_SYSTEM_PROMPT.trim()]; // UNIFIED: Use same prompt as Claude
    if (systemPrompt && systemPrompt.trim().length > 0) {
      systemParts.push(systemPrompt.trim());
    }

    // Combine system prompt and user prompt for planning
    // Note: Codex SDK doesn't have system prompt configuration, so we prepend it to the user prompt
    const combinedPrompt = `${systemParts.join("\n\n")}\n\n${prompt}`;

    const thread = codex.startThread({
      sandboxMode: "danger-full-access",
      model: CODEX_MODEL,
      workingDirectory,
      skipGitRepoCheck: true,
    });

    buildLogger.codexQuery.threadStarting();

    const MAX_TURNS = 50;
    let turnCount = 0;
    let smartTracker: SmartTodoTracker | null = null;

    // ========================================
    // PHASE 1: STRUCTURED TASK PLANNING
    // ========================================
    log('🎯 [codex-query] PHASE 1: Getting task plan with structured output...');
    turnCount++;

    const planningPrompt = `${combinedPrompt}

Analyze this request and create a task plan. Break it into 3-8 high-level tasks focusing on USER-FACING FEATURES.

Return your response as JSON with:
- analysis: Brief overview of what you'll build (2-3 sentences)
- todos: Array of tasks with content, activeForm, and status

All tasks should start as "pending" except the first one which should be "in_progress".`;

    let taskPlan;
    try {
      log('📋 [codex-query] Requesting structured task plan...');
      const planningTurn = await thread.run(planningPrompt, {
        outputSchema: getTaskPlanJsonSchema(),
      });

      taskPlan = JSON.parse(planningTurn.finalResponse);
      log('✅ [codex-query] Got structured task plan!');
      log(`   Analysis: ${taskPlan.analysis}`);
      log(`   Tasks: ${taskPlan.todos.length}`);

      // Initialize smart tracker
      smartTracker = createSmartTracker(taskPlan.todos);

      // Send initial TodoWrite
      const todoWriteEvent = {
        type: 'assistant',
        message: {
          id: `codex-planning-${Date.now()}`,
          content: [{
            type: 'tool_use',
            id: `todo-init-${Date.now()}`,
            name: 'TodoWrite',
            input: { todos: taskPlan.todos },
          }],
        },
      };

      yield todoWriteEvent;

    } catch (error) {
      buildLogger.codexQuery.error('ERROR in structured planning', error);
      throw error;
    }

    // ========================================
    // PHASE 2: TASK EXECUTION LOOP
    // ========================================
    log('🎯 [codex-query] PHASE 2: Executing tasks sequentially...');

    while (turnCount < MAX_TURNS) {
      if (!smartTracker || isTrackerComplete(smartTracker)) {
        log('✅ [codex-query] All tasks complete!');
        break;
      }

      const currentTask = getCurrentTask(smartTracker);
      if (!currentTask) {
        log('❌ [codex-query] No current task - cannot continue');
        break;
      }

      const currentTaskIndex = smartTracker.currentIndex;
      log(`🚀 [codex-query] Working on task ${currentTaskIndex + 1}: ${currentTask.content}`);

      // Send pre-task TodoWrite to set active index
      const preTaskUpdate = {
        type: 'assistant',
        message: {
          id: `pre-task-${Date.now()}`,
          content: [{
            type: 'tool_use',
            id: `pre-todo-${Date.now()}`,
            name: 'TodoWrite',
            input: { todos: smartTracker.todos },
          }],
        },
      };
      yield preTaskUpdate;

      // Execute turn for this specific task
      const taskPrompt = `Work on this specific task NOW: "${currentTask.content}"

Execute ALL necessary file operations and commands to fully complete this task.
Don't just plan - TAKE ACTION and create/modify files.`;

      turnCount++;
      log(`🚀 [codex-query] Turn ${turnCount}: ${taskPrompt.substring(0, 80)}...`);

      // Stream events through Codex SDK adapter
      const streamedTurn = await thread.runStreamed(taskPrompt);

      // StreamedTurn has an 'events' property that's an AsyncGenerator<ThreadEvent>
      for await (const event of streamedTurn.events) {
        // Transform single event - create simple async generator wrapper
        async function* singleEvent() {
          yield event;
        }

        // Transform Codex events to unified format
        for await (const message of transformCodexStream(singleEvent())) {
          yield message;
        }
      }

      // Mark task as complete
      smartTracker.todos[currentTaskIndex].status = 'completed';
      if (currentTaskIndex + 1 < smartTracker.todos.length) {
        smartTracker.todos[currentTaskIndex + 1].status = 'in_progress';
        smartTracker.currentIndex = currentTaskIndex + 1;
      }

      // Send post-task TodoWrite
      const postTaskUpdate = {
        type: 'assistant',
        message: {
          id: `post-task-${Date.now()}`,
          content: [{
            type: 'tool_use',
            id: `post-todo-${Date.now()}`,
            name: 'TodoWrite',
            input: { todos: smartTracker.todos },
          }],
        },
      };
      yield postTaskUpdate;
    }

    buildLogger.codexQuery.sessionComplete(turnCount);
    fileLog.info('━━━ CODEX QUERY COMPLETE ━━━');
    fileLog.info(`Total turns: ${turnCount}`);
  };
}

function createBuildQuery(agent: AgentId, claudeModel?: ClaudeModelId): BuildQueryFn {
  if (agent === "openai-codex") {
    return createCodexQuery();
  }
  return createClaudeQuery(claudeModel ?? DEFAULT_CLAUDE_MODEL_ID);
}

/**
 * Retry a fetch call with exponential backoff
 */
async function fetchWithRetry(url: string, options: RequestInit, maxAttempts = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts) {
        const delay = 1000 * attempt; // 1s, 2s, 3s
        console.log(`   ⏳ Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Cleanup orphaned processes on startup
 */
async function cleanupOrphanedProcesses(apiBaseUrl: string, runnerSharedSecret: string, runnerId: string) {
  if (!isSilentMode) {
    console.log('🧹 Cleaning up orphaned processes from previous runs...');
  }

  try {
    // Get list of processes from API (filtered by this runner's ID)
    const response = await fetchWithRetry(`${apiBaseUrl}/api/runner/process/list?runnerId=${encodeURIComponent(runnerId)}`, {
      headers: {
        'Authorization': `Bearer ${runnerSharedSecret}`,
      },
    }, 3);

    if (!response.ok) {
      console.error('❌ Failed to fetch process list for cleanup');
      return;
    }

    const { processes } = await response.json();
    if (!isSilentMode) {
      console.log(`   Found ${processes.length} processes to check for this runner`);
    }

    for (const row of processes) {
      try {
        // Check if process still exists locally (signal 0 = check existence, doesn't kill)
        process.kill(row.pid, 0);
        if (!isSilentMode && DEBUG_BUILD) console.log(`   ✅ Process ${row.pid} (project ${row.projectId.slice(0, 8)}) still running`);
      } catch (err) {
        // Process doesn't exist - orphaned, unregister via API
        console.log(`   ❌ Orphaned process ${row.pid} (project ${row.projectId.slice(0, 8)}), cleaning up`);

        await fetchWithRetry(`${apiBaseUrl}/api/runner/process/${row.projectId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${runnerSharedSecret}`,
          },
        }, 3);
      }
    }

    if (!isSilentMode) {
      if (!isSilentMode && DEBUG_BUILD) console.log('✅ Orphaned process cleanup complete');
    }
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  }
}

/**
 * Check if a port is in use by trying to connect to it
 * This is more reliable than trying to bind
 */
async function checkPortInUse(port: number): Promise<boolean> {
  const net = await import('net');

  return new Promise((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(2000);

    socket.once('connect', () => {
      // Successfully connected = server is running
      if (!isSilentMode) {
        console.log(`   🔍 [Debug] Port ${port} check: Connected successfully → Server IS running`);
      }
      socket.destroy();
      resolve(true);
    });

    socket.once('error', (err: Error) => {
      // Connection failed = server not running
      console.log(`   🔍 [Debug] Port ${port} check: ${err.message} → Server NOT running`);
      resolve(false);
    });

    socket.once('timeout', () => {
      // Timeout = server not responding
      console.log(`   🔍 [Debug] Port ${port} check: Timeout → Server NOT running`);
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, 'localhost');
  });
}

/**
 * Start periodic health checks for running processes
 */
function startPeriodicHealthChecks(apiBaseUrl: string, runnerSharedSecret: string, runnerId: string) {
  if (!isSilentMode) {
    console.log('🏥 Starting periodic port health checks (every 30s)...');
  }

  const doHealthCheck = async () => {
    try {
      // Get list of processes to health check from API (filtered by this runner's ID)
      const response = await fetchWithRetry(`${apiBaseUrl}/api/runner/process/list?runnerId=${encodeURIComponent(runnerId)}`, {
        headers: {
          'Authorization': `Bearer ${runnerSharedSecret}`,
        },
      }, 3);

      if (!response.ok) {
        console.error('❌ Failed to fetch process list for health check');
        return;
      }

      const { processes } = await response.json();

      for (const row of processes) {
        if (!row.port) continue; // Skip if no port detected yet

        // Check port locally (runner can access localhost)
        const isListening = await checkPortInUse(row.port);

        if (!isSilentMode && DEBUG_BUILD) console.log(`   🔍 Health check for port ${row.port}: ${isListening ? 'HEALTHY ✅' : 'UNHEALTHY ❌'}`);

        const newFailCount = isListening ? 0 : (row.healthCheckFailCount || 0) + 1;

        if (!isListening && newFailCount >= 3) {
          // Failed 3 times - kill the process locally and report to API
          console.log(`   ❌ Port ${row.port} not in use after 3 checks, killing process for project ${row.projectId.slice(0, 8)}`);

          // Stop the process if it still exists
          try {
            process.kill(row.pid, 'SIGTERM');
            console.log(`      Sent SIGTERM to PID ${row.pid}`);
          } catch (err) {
            // Process already dead
          }
        }

        // Report health status to API
        await fetchWithRetry(`${apiBaseUrl}/api/runner/process/${row.projectId}/health`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${runnerSharedSecret}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            port: row.port,
            status: isListening ? 'healthy' : 'unhealthy',
            failCount: newFailCount,
          }),
        }, 3);

        if (!isListening) {
          console.log(`   ⚠️  Port ${row.port} not in use (fail ${newFailCount}/3) for project ${row.projectId.slice(0, 8)}`);
        }
      }
    } catch (error) {
      console.error('❌ Error during health check:', error);
    }
  };

  // Run health check every 30 seconds
  setInterval(doHealthCheck, 30000);
}

/**
 * Start the runner with the given options
 */
export async function startRunner(options: RunnerOptions = {}) {
  // Set silent mode if requested (for TUI)
  isSilentMode = options.silent || false;

  // Also set silent mode for all modules
  if (isSilentMode) {
    const { setSilentMode: setProcessManagerSilent } = await import('./lib/process-manager.js');
    setProcessManagerSilent(true);

    const { setSilentMode: setPortCheckerSilent } = await import('./lib/port-checker.js');
    setPortCheckerSilent(true);

    // Set silent mode on tunnel manager globally
    tunnelManager.setSilent(true);
  }

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

  // Get API URL from options, env, or fallback to deriving from broker
  const apiBaseUrl = options.apiUrl || process.env.API_BASE_URL || (() => {
    // Fallback: derive from broker URL (same host, http/https protocol)
    const brokerUrl = new URL(BROKER_URL);
    const protocol = brokerUrl.protocol === 'wss:' ? 'https:' : 'http:';

    // Special case for local development: broker is :4000, API is :3000
    if (brokerUrl.hostname === 'localhost' || brokerUrl.hostname === '127.0.0.1') {
      return `${protocol}//localhost:3000`;
    }

    // For remote deployments, API and broker share the same host
    return `${protocol}//${brokerUrl.host}`;
  })();

  if (!SHARED_SECRET) {
    console.error("RUNNER_SHARED_SECRET is required");
    throw new Error("RUNNER_SHARED_SECRET is required");
  }

  const runnerSharedSecret = SHARED_SECRET; // Guaranteed to be string after check

  // Set environment variables for process-manager and other modules
  process.env.API_BASE_URL = apiBaseUrl;
  process.env.RUNNER_SHARED_SECRET = runnerSharedSecret;
  process.env.RUNNER_ID = RUNNER_ID;

  log("api base url:", apiBaseUrl);

  // Cleanup orphaned processes on startup
  cleanupOrphanedProcesses(apiBaseUrl, runnerSharedSecret, RUNNER_ID).catch((err) => {
    console.error('❌ Failed to cleanup orphaned processes on startup:', err);
  });

  // Start periodic health checks
  startPeriodicHealthChecks(apiBaseUrl, runnerSharedSecret, RUNNER_ID);

  let socket: WebSocket | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let pingTimer: NodeJS.Timeout | null = null;
  let loggedFirstChunk = false;
  let reconnectAttempts = 0;
  let isShuttingDown = false; // Prevent reconnection during shutdown
  const MAX_RECONNECT_DELAY = 30000; // 30 seconds max
  const PING_INTERVAL = 30000; // Ping every 30 seconds

  // Track verified listening ports per project (single source of truth)
  const verifiedPortsByProject = new Map<string, number>();

  function assertNever(value: never): never {
    throw new Error(`Unhandled runner command: ${JSON.stringify(value)}`);
  }

  function sendEvent(event: RunnerEvent) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      log(
        `[runner] Cannot send event ${event.type}: WebSocket not connected (state: ${socket?.readyState})`
      );
      return;
    }
    try {
      const eventJson = JSON.stringify(event);

      // Only log important events
      if (event.type === "error") {
        log(`❌ Error: ${event.error}`);
        if (event.stack) {
          log(`Stack: ${event.stack.substring(0, 500)}`);
        }
      } else if (event.type === "port-detected") {
        log(`🔌 Port detected: ${event.port}`);
      } else if (event.type === "tunnel-created") {
        log(
          `🔗 Tunnel created: ${event.tunnelUrl} -> localhost:${event.port}`
        );
      } else if (event.type === "build-completed") {
        log(
          `✅ Build completed for project: ${event.projectId}`
        );
      } else if (event.type === "build-failed") {
        log(`❌ Build failed: ${event.error}`);
      }
      // Suppress: build-stream, runner-status, ack, etc.

      socket.send(eventJson);
    } catch (error) {
      log(`❌ Failed to send event ${event.type}:`, error);
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
    log(
      `📥 Received command: ${command.type} for project: ${command.projectId}`
    );
    log(`  Command ID: ${command.id}`);
    log(`  Timestamp: ${command.timestamp}`);

    // Log command-specific details
    if (command.type === "start-build") {
      log(
        `  Build operation: ${command.payload.operationType}`
      );
      log(`  Project slug: ${command.payload.projectSlug}`);
      log(
        `  Prompt length: ${command.payload.prompt?.length || 0} chars`
      );
    } else if (command.type === "start-dev-server") {
      log(
        `  Working directory: ${command.payload.workingDirectory}`
      );
      log(`  Run command: ${command.payload.runCommand}`);
    } else if (
      command.type === "start-tunnel" ||
      command.type === "stop-tunnel"
    ) {
      log(`  Port: ${command.payload.port}`);
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
            framework,
          } = command.payload;

          // Don't allocate port - let the dev server choose and we'll detect it
          // Build environment without forcing a specific port
          // Filter out undefined values to satisfy Record<string, string> type
          const envVars: Record<string, string> = {};
          for (const [key, value] of Object.entries({
            ...process.env,
            ...env,
          })) {
            if (value !== undefined) {
              envVars[key] = String(value);
            }
          }

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
            log(
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
              log(
                `🔗 Closing tunnel for verified port ${verifiedPort}`
              );
              await tunnelManager.closeTunnel(verifiedPort);
              verifiedPortsByProject.delete(command.projectId);
            }

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
          log(`🔗 Starting tunnel for port ${port}...`);

          // Wait for the port to be ready before creating tunnel
          log(`⏳ Waiting for port ${port} to be ready...`);
          const isReady = await waitForPort(port, 15, 1000); // 15 retries, 1s apart = max 15s

          if (!isReady) {
            throw new Error(`Port ${port} is not ready or not accessible`);
          }

          // Ensure tunnel manager is in silent mode
          tunnelManager.setSilent(isSilentMode);

          // Create tunnel
          const tunnelUrl = await tunnelManager.createTunnel(port);
          log(`✅ Tunnel created: ${tunnelUrl} → localhost:${port}`);

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
          log(`🔗 Stopping tunnel for port ${port}...`);

          // Ensure tunnel manager is in silent mode
          tunnelManager.setSilent(isSilentMode);

          await tunnelManager.closeTunnel(port);
          log(`✅ Tunnel closed for port ${port}`);

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
            log(
              `[runner] ⚠️  rm -rf failed, trying fs.rm with maxRetries...`
            );
            log(`[runner]   Error:`, rmError instanceof Error ? rmError.message : String(rmError));

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

          if (!isSilentMode && DEBUG_BUILD) console.log(`[runner] ✅ Found ${files.length} entries`);

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
        // Log immediately when start-build is received
        log("📥 Received start-build command");
        log("   Project ID:", command.projectId);
        log("   Prompt:", command.payload?.prompt?.substring(0, 100) + '...');

        // Also log to file
        fileLog.info('━━━ START-BUILD COMMAND RECEIVED ━━━');
        fileLog.info('Project ID:', command.projectId);
        fileLog.info('Command ID:', command.id);
        fileLog.info('Prompt:', command.payload?.prompt);
        fileLog.info('Operation:', command.payload?.operationType);
        fileLog.info('Agent:', command.payload?.agent);
        fileLog.info('Template:', command.payload?.template);

        // Create a span for the build operation (AI spans will be auto-created by vercelAIIntegration)
        await Sentry.startSpan(
          {
            name: 'runner.build',
            op: 'build',
            attributes: {
              'build.project_id': command.projectId,
              'build.operation': command.payload?.operationType,
              'build.agent': command.payload?.agent,
              'build.template': command.payload?.template?.name,
            },
          },
          async () => {
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
          const agent =
            (command.payload.agent as AgentId | undefined) ?? DEFAULT_AGENT;
          const agentLabel = agent === "openai-codex" ? "Codex" : "Claude";
          log("selected agent:", agent);
          const claudeModel: ClaudeModelId =
            agent === "claude-code" &&
            (command.payload.claudeModel === "claude-haiku-4-5" ||
              command.payload.claudeModel === "claude-sonnet-4-5")
              ? command.payload.claudeModel
              : DEFAULT_CLAUDE_MODEL_ID;

          if (agent === "claude-code") {
            log("claude model:", claudeModel);
          }

          const agentQuery = createBuildQuery(agent, claudeModel);

          // Reset transformer state for new build
          resetTransformerState();
          setExpectedCwd(projectDirectory);

          // Orchestrate the build - handle templates, generate dynamic prompt
          log("orchestrating build...");

          // Log template if provided
          if (command.payload.templateId) {
            log("template provided by frontend:", command.payload.templateId);
          }

          const orchestration = await orchestrateBuild({
            projectId: command.projectId,
            projectName: projectSlug,
            prompt: command.payload.prompt,
            operationType: command.payload.operationType,
            workingDirectory: projectDirectory,
            agent,
            template: command.payload.template, // NEW: Pass template from frontend
            designPreferences: command.payload.designPreferences, // User-specified design constraints (deprecated - use tags)
            tags: command.payload.tags, // Tag-based configuration
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

          buildLog(` 🚀 Starting build stream for project: ${command.projectId}`
          );
          buildLog(`   Directory: ${projectDirectory}`);
          buildLog(`   Is new project: ${orchestration.isNewProject}`
          );
          buildLog(`   Template: ${orchestration.template?.name || "none"}`
          );

          const stream = await createBuildStream({
            projectId: command.projectId,
            projectName,
            prompt: orchestration.fullPrompt,
            operationType: command.payload.operationType,
            context: command.payload.context,
            query: agentQuery,
            workingDirectory: projectDirectory,
            systemPrompt: orchestration.systemPrompt,
            agent,
            claudeModel: agent === "claude-code" ? claudeModel : undefined,
            isNewProject: orchestration.isNewProject,
          });

          buildLog(` 📡 Build stream created, starting to process chunks...`
          );

          const reader = stream.getReader();
          const decoder = new TextDecoder();

          let chunkCount = 0;
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              buildLog(` Stream reader reports DONE after ${chunkCount} chunks`
              );
              break;
            }
            if (value === undefined || value === null) continue;
            chunkCount++;

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
              log(
                "Unsupported chunk type from build stream:",
                typeof value
              );
              continue;
            }

            if (!loggedFirstChunk) {
              buildLog(` 📨 First chunk received from ${agentLabel}`);
              buildLog(" 🔥🔥🔥 NEW LOGGING CODE IS ACTIVE 🔥🔥🔥");
              loggedFirstChunk = true;
            }

            // Log generation and tool usage
            if (typeof agentMessage === "object" && agentMessage !== null) {
              const msg = agentMessage as Record<string, unknown>;

              // The actual message is nested in a 'message' property
              const actualMessage = (msg.message as Record<string, unknown>) || msg;

              // Handle assistant messages (conversation turn format)
              if (
                msg.type === "assistant" &&
                actualMessage.content &&
                Array.isArray(actualMessage.content)
              ) {
                for (const block of actualMessage.content) {
                  // Log text content
                  if (block.type === "text" && block.text) {
                    buildLog(` 💭 ${agentLabel}: ${block.text.slice(0, 200)}${
                        block.text.length > 200 ? "..." : ""
                      }`
                    );
                  }

                  // Log thinking blocks
                  if (block.type === "thinking" && block.thinking) {
                    buildLog(` 🤔 Thinking: ${block.thinking.slice(0, 300)}${
                        block.thinking.length > 300 ? "..." : ""
                      }`
                    );
                  }

                  // Log tool use
                  if (block.type === "tool_use") {
                    const toolName = block.name;
                    const toolId = block.id;
                    const input = JSON.stringify(block.input, null, 2);
                    buildLog(` 🔧 Tool called: ${toolName} (${toolId})`
                    );
                    buildLog(`    Input: ${input.slice(0, 300)}${
                        input.length > 300 ? "..." : ""
                      }`
                    );
                  }
                }
              }

              // Handle user messages (tool results)
              if (
                msg.type === "user" &&
                actualMessage.content &&
                Array.isArray(actualMessage.content)
              ) {
                for (const block of actualMessage.content) {
                  if (block.type === "tool_result") {
                    const toolId = block.tool_use_id;
                    const isError = block.is_error;

                    // Handle different content formats
                    let content = "";
                    if (typeof block.content === "string") {
                      content = block.content;
                    } else if (Array.isArray(block.content)) {
                      // Content might be an array of content blocks
                      content = (block.content as Array<{ type: string; text?: string }>)
                        .map((c) => {
                          if (c.type === "text" && c.text) return c.text;
                          return JSON.stringify(c);
                        })
                        .join("\n");
                    } else {
                      content = JSON.stringify(block.content);
                    }

                    if (isError) {
                      buildLog(` ❌ Tool error (${toolId}):`);
                      buildLog(`    ${content.slice(0, 500)}${
                          content.length > 500 ? "..." : ""
                        }`
                      );
                    } else {
                      buildLog(` ✅ Tool result (${toolId}):`);
                      buildLog(`    ${content.slice(0, 500)}${
                          content.length > 500 ? "..." : ""
                        }`
                      );
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

          buildLog(` ═══════════════════════════════════════════════`
          );
          buildLog(` STREAM ENDED - Processing final chunks`);
          buildLog(` ═══════════════════════════════════════════════`
          );

          const finalChunk = decoder.decode();
          if (finalChunk) {
            buildLog(` Final chunk decoded: ${finalChunk.length} chars`
            );
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

          buildLog(` Sending [DONE] signal to client`);
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

                if (!isSilentMode && DEBUG_BUILD) console.log(`✅ Detected runCommand: ${runCommand}`);
              }
            }
          } catch (error) {
            log("Failed to detect runCommand:", error);
          }

          buildLog(` ✅ Build completed successfully for project: ${command.projectId}`
          );
          buildLog(`   Total chunks processed: (stream ended)`);

          sendEvent({
            type: "build-completed",
            ...buildEventBase(command.projectId, command.id),
            payload: { todos: [], summary: "Build completed" },
          });
          // span.end();
        } catch (error) {
          console.error("Failed to run build", error);
          Sentry.getActiveSpan()?.setStatus({
            code: 2,
            message: "Build failed",
          });
          sendEvent({
            type: "build-failed",
            ...buildEventBase(command.projectId, command.id),
            error:
              error instanceof Error ? error.message : "Failed to run build",
            stack: error instanceof Error ? error.stack : undefined,
          });
            }
          }
        );
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
          try {
            const command = JSON.parse(String(data)) as RunnerCommand;

            // Continue trace if parent trace context exists, otherwise start new
            if (command._sentry?.trace) {
              Sentry.continueTrace(
                {
                  sentryTrace: command._sentry.trace,
                  baggage: command._sentry.baggage,
                },
                async () => {
                  // Add metadata to trace
                  Sentry.setTag('command_type', command.type);
                  Sentry.setTag('project_id', command.projectId);
                  Sentry.setTag('command_id', command.id);

                  await handleCommand(command);
                }
              );
            } else {
              // No parent trace - start new one
              Sentry.startNewTrace(async () => {
                Sentry.setTag('command_type', command.type);
                Sentry.setTag('project_id', command.projectId);
                Sentry.setTag('command_id', command.id);

                await handleCommand(command);
              });
            }
          } catch (error) {
            console.error("Failed to parse command", error);
            Sentry.captureException(error);
            sendEvent({
              type: "error",
              ...buildEventBase(undefined, randomUUID()),
              error: "Failed to parse command payload",
              stack: error instanceof Error ? error.stack : undefined,
            });
          }
        });

    socket.on("close", (code: number, reason: Buffer) => {
      const reasonStr = reason.toString() || "no reason provided";
      log(`connection closed with code ${code}, reason: ${reasonStr}`);

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }

      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }

      // Don't reconnect if we're shutting down
      if (isShuttingDown) {
        log('shutdown in progress, skipping reconnection');
        return;
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
    // Prevent duplicate shutdown calls
    if (isShuttingDown) return;

    log("shutting down");
    isShuttingDown = true; // Prevent reconnection attempts

    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (pingTimer) clearInterval(pingTimer);

    // Close WebSocket connection gracefully
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close(1000, 'Shutdown requested');
    }

    // Cleanup all tunnels
    await tunnelManager.closeAll();

    // Flush Sentry events before exiting
    await Sentry.flush(2000);

    // Don't call process.exit() - let the CLI's shutdown handler finish
    // If running standalone (not via CLI), the process will exit naturally
  });

  process.on("SIGTERM", async () => {
    // Prevent duplicate shutdown calls
    if (isShuttingDown) return;

    log("shutting down (SIGTERM)");
    isShuttingDown = true; // Prevent reconnection attempts

    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (pingTimer) clearInterval(pingTimer);

    // Close WebSocket connection gracefully
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close(1000, 'Shutdown requested');
    }

    // Cleanup all tunnels
    await tunnelManager.closeAll();

    // Flush Sentry events before exiting
    await Sentry.flush(2000);

    // Don't call process.exit() - let the CLI's shutdown handler finish
  });

  connect();
}

// If running this file directly, start the runner
// ESM equivalent of: if (require.main === module)
if (import.meta.url === `file://${process.argv[1]}`) {
  startRunner();
}
