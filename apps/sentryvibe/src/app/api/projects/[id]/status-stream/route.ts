import { NextRequest } from 'next/server';
import { db, resetDbClient } from '@sentryvibe/agent-core/lib/db/client';
import { projects } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import { projectEvents } from '@/lib/project-events';

const isVerboseSSELogging = process.env.SENTRYVIBE_DEBUG_SSE === '1';
const debugLog = (...args: unknown[]) => {
  if (isVerboseSSELogging) {
    console.log(...args);
  }
};
const loggedMissingProjects = new Set<string>();
const transientDbErrorCodes = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
]);

const transientDbMessageMatchers = [
  'terminating connection',
  'Connection terminated unexpectedly',
  'server closed the connection',
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const withCode = error as { code?: string; cause?: unknown };
  if (withCode.code && typeof withCode.code === 'string') {
    return withCode.code;
  }

  if (withCode.cause && typeof withCode.cause === 'object') {
    const causeCode = (withCode.cause as { code?: string }).code;
    if (causeCode && typeof causeCode === 'string') {
      return causeCode;
    }
  }

  return undefined;
}

function extractErrorMessage(error: unknown): string | undefined {
  if (!error) {
    return undefined;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object') {
    const withMessage = error as { message?: string; cause?: unknown };
    if (withMessage.message && typeof withMessage.message === 'string') {
      return withMessage.message;
    }
    if (withMessage.cause && typeof withMessage.cause === 'object') {
      const causeMessage = (withMessage.cause as { message?: string }).message;
      if (causeMessage && typeof causeMessage === 'string') {
        return causeMessage;
      }
    }
  }

  return undefined;
}

function isTransientDbError(error: unknown) {
  const code = extractErrorCode(error);
  if (code && transientDbErrorCodes.has(code)) {
    return true;
  }

  const message = extractErrorMessage(error);
  if (!message) {
    return false;
  }

  if (/ECONNRESET|Connection terminated|terminating connection/i.test(message)) {
    return true;
  }

  return transientDbMessageMatchers.some((snippet) => message.includes(snippet));
}

async function runWithDbRetry<T>(
  label: string,
  operation: () => Promise<T>,
  maxAttempts = 2
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isTransientDbError(error) || attempt === maxAttempts) {
        throw error;
      }

      console.warn(`🔁 Transient database error during ${label}. Retrying (attempt ${attempt}/${maxAttempts})`);
      resetDbClient(error);
      await delay(50 * attempt);
    }
  }

  throw lastError;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SSE endpoint for real-time project status updates
 * Uses event-driven architecture for instant updates (no polling!)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  debugLog(`📡 SSE status stream requested for project: ${id}`);

  const encoder = new TextEncoder();
  let keepaliveInterval: NodeJS.Timeout | null = null;
  let periodicCheck: NodeJS.Timeout | null = null;
  let isClosed = false;
  let activeProjectUpdateHandler: ((project: any) => void) | null = null;

  const safeEnqueue = (controller: ReadableStreamDefaultController, data: string) => {
    if (isClosed) return;
    try {
      controller.enqueue(encoder.encode(data));
    } catch (err) {
      if (process.env.SENTRYVIBE_DEBUG_SSE === '1') {
        console.warn(`⚠️  Failed to enqueue SSE data for ${id}:`, err);
      }
      safeClose(controller);
    }
  };

  const safeClose = (controller: ReadableStreamDefaultController) => {
    if (isClosed) return;
    isClosed = true;
    try {
      controller.close();
    } catch (err) {
      if (process.env.SENTRYVIBE_DEBUG_SSE === '1') {
        console.warn(`⚠️  Failed to close SSE controller for ${id}:`, err);
      }
    }
    if (keepaliveInterval) {
      clearInterval(keepaliveInterval);
      keepaliveInterval = null;
    }
    if (periodicCheck) {
      clearInterval(periodicCheck);
      periodicCheck = null;
    }
    if (activeProjectUpdateHandler) {
      projectEvents.offProjectUpdate(id, activeProjectUpdateHandler);
      activeProjectUpdateHandler = null;
    }
  };

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const enqueueConnected = `data: ${JSON.stringify({ type: 'connected' })}\n\n`;
          safeEnqueue(controller, enqueueConnected);

          const loadProjectSnapshot = async (label: string) => {
            const rows = await runWithDbRetry(label, () =>
              db
                .select()
                .from(projects)
                .where(eq(projects.id, id))
                .limit(1)
            );
            return rows[0] ?? null;
          };

          // Send initial project state immediately
          const initialProject = await loadProjectSnapshot('initial-project-state');

          if (initialProject) {
            const data = `data: ${JSON.stringify({
              type: 'status-update',
              project: initialProject,
            })}\n\n`;
            safeEnqueue(controller, data);
            debugLog(`✅ Sent initial status for ${id}`);
          } else {
            if (!loggedMissingProjects.has(id)) {
              console.warn(`⚠️  Project ${id} not found`);
              loggedMissingProjects.add(id);
            }
            safeClose(controller);
            return;
          }

          // Start keepalive pings every 15 seconds
          keepaliveInterval = setInterval(() => {
            safeEnqueue(controller, ':keepalive\n\n');
          }, 15000);

          // Event-driven updates: listen for project changes
          const projectUpdateHandler = (project: any) => {
            try {
              const data = `data: ${JSON.stringify({
                type: 'status-update',
                project,
              })}\n\n`;
              safeEnqueue(controller, data);
              debugLog(`📤 Event-driven update for ${id}:`, {
                status: project.devServerStatus,
                port: project.devServerPort,
                tunnel: project.tunnelUrl,
              });
            } catch (err) {
              console.error(`   Failed to send update for ${id}:`, err);
            }
          };

          // Subscribe to project events
          projectEvents.onProjectUpdate(id, projectUpdateHandler);
          activeProjectUpdateHandler = projectUpdateHandler;

          // Hybrid approach: Event-driven with periodic safety check
          // This handles race conditions and missed events
          let lastSentState: string | null = null;

          const sendLatestState = async () => {
            try {
              const proj = await loadProjectSnapshot('periodic-project-state');

              if (proj) {
                const currentState = JSON.stringify({
                  status: proj.status,
                  devServerStatus: proj.devServerStatus,
                  devServerPort: proj.devServerPort,
                  tunnelUrl: proj.tunnelUrl,
                });

                // Only send if state actually changed
                if (currentState !== lastSentState) {
                  debugLog(`🔄 Sending state update for ${id} (periodic check)`);
                  lastSentState = currentState;
                  const data = `data: ${JSON.stringify({
                    type: 'status-update',
                    project: proj,
                  })}\n\n`;
                  safeEnqueue(controller, data);
                }
              }
            } catch (err) {
              console.error(`   Failed to send state update for ${id}:`, err);
            }
          };

          // Initial fallback after 1 second
          setTimeout(sendLatestState, 1000);

          // Periodic safety check every 5 seconds
          periodicCheck = setInterval(sendLatestState, 5000);

          // Cleanup on connection close
          req.signal.addEventListener('abort', () => {
            debugLog(`🔌 Client disconnected from status stream for ${id}`);
            safeClose(controller);
          });
        } catch (error) {
          console.error(`❌ Error starting status stream for ${id}:`, error);
          if (!isClosed) {
            try {
              controller.error(error);
            } catch {
              safeClose(controller);
            }
          }
        }
      },

      cancel() {
        debugLog(`🛑 Status stream cancelled for ${id}`);
        const dummyController = {
          close: () => {},
          enqueue: () => {},
        } as unknown as ReadableStreamDefaultController;
        safeClose(dummyController);
      },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
