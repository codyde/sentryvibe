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

  // Validate project exists BEFORE creating the stream
  // This prevents "failed to pipe response" errors if database is unavailable
  let initialProject;
  try {
    initialProject = await db.select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (initialProject.length === 0) {
      if (!loggedMissingProjects.has(id)) {
        console.warn(`⚠️  Project ${id} not found`);
        loggedMissingProjects.add(id);
      }
      return new Response(
        JSON.stringify({ error: 'Project not found' }),
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  } catch (error) {
    console.error(`❌ Database error for project ${id}:`, error);
    return new Response(
      JSON.stringify({ 
        error: 'Database connection failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

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

        // Send initial project state immediately (using pre-fetched data)
        const data = `data: ${JSON.stringify({
          type: 'status-update',
          project: initialProject[0],
        })}\n\n`;
        safeEnqueue(controller, data);
        debugLog(`✅ Sent initial status for ${id}`);

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
            const latestProject = await db.select()
              .from(projects)
              .where(eq(projects.id, id))
              .limit(1);

            if (latestProject.length > 0) {
              const proj = latestProject[0];
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
