import { NextRequest } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
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
  'EPIPE',
  'ETIMEDOUT',
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
]);

const getNumberEnv = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const dbRetryAttempts = getNumberEnv(process.env.SENTRYVIBE_DB_RETRY_ATTEMPTS, 3);
const dbRetryDelayMs = getNumberEnv(process.env.SENTRYVIBE_DB_RETRY_DELAY_MS, 150);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const err = error as Record<string, any>;
  return err.code ?? err?.cause?.code ?? err?.originalError?.code;
};

const shouldRetryDbError = (error: unknown) => {
  const code = getErrorCode(error);
  return code ? transientDbErrorCodes.has(code) : false;
};

async function fetchProjectWithRetry(id: string) {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < dbRetryAttempts) {
    try {
      const result = await db.select()
        .from(projects)
        .where(eq(projects.id, id))
        .limit(1);
      return result[0] ?? null;
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (!shouldRetryDbError(error) || attempt >= dbRetryAttempts) {
        throw error;
      }
      await wait(dbRetryDelayMs * attempt);
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

    const sendStreamError = (
      controller: ReadableStreamDefaultController,
      error: unknown
    ) => {
      const code = getErrorCode(error);
      const payload = {
        type: 'status-stream-error',
        message: 'Failed to start status stream',
        ...(code ? { code } : {}),
      };
      safeEnqueue(controller, `event: error\ndata: ${JSON.stringify(payload)}\n\n`);
      safeClose(controller);
    };

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const enqueueConnected = `data: ${JSON.stringify({ type: 'connected' })}\n\n`;
          safeEnqueue(controller, enqueueConnected);

          // Send initial project state immediately
          const initialProject = await fetchProjectWithRetry(id);

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
              const latestProject = await fetchProjectWithRetry(id);

              if (latestProject) {
                const proj = latestProject;
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
            sendStreamError(controller, error);
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
