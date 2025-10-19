import { NextRequest } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { projects } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SSE endpoint for real-time project status updates
 * Replaces polling with event-driven updates
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  console.log(`📡 SSE status stream requested for project: ${id}`);

  const encoder = new TextEncoder();
  let keepaliveInterval: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send connected message first to establish stream
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`));

        // Send initial project state immediately
        const initialProject = await db.select()
          .from(projects)
          .where(eq(projects.id, id))
          .limit(1);

        if (initialProject.length > 0) {
          const data = `data: ${JSON.stringify({
            type: 'status-update',
            project: initialProject[0],
          })}\n\n`;
          controller.enqueue(encoder.encode(data));
          console.log(`✅ Sent initial status for ${id}`);
        } else {
          console.warn(`⚠️  Project ${id} not found`);
          controller.close();
          return;
        }

        // Start keepalive pings every 15 seconds
        keepaliveInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(':keepalive\n\n'));
          } catch (err) {
            console.log(`   Keepalive failed for ${id}, stream likely closed`);
            if (keepaliveInterval) {
              clearInterval(keepaliveInterval);
              keepaliveInterval = null;
            }
          }
        }, 15000);

        // Adaptive polling: fast during transitions, slow when stable
        let lastState = JSON.stringify({
          status: initialProject[0].status,
          devServerStatus: initialProject[0].devServerStatus,
          devServerPort: initialProject[0].devServerPort,
          tunnelUrl: initialProject[0].tunnelUrl,
        });

        let currentPollInterval = 2000; // Start with 2s
        let pollTimeout: NodeJS.Timeout | null = null;
        let stableCount = 0; // Track how long state has been stable

        const doPoll = async () => {
          try {
            const updatedProject = await db.select()
              .from(projects)
              .where(eq(projects.id, id))
              .limit(1);

            if (updatedProject.length > 0) {
              const proj = updatedProject[0];

              // Only send if status/port/tunnel changed
              const currentState = JSON.stringify({
                status: proj.status,
                devServerStatus: proj.devServerStatus,
                devServerPort: proj.devServerPort,
                tunnelUrl: proj.tunnelUrl,
              });

              if (currentState !== lastState) {
                lastState = currentState;
                stableCount = 0; // Reset stability counter

                const data = `data: ${JSON.stringify({
                  type: 'status-update',
                  project: proj,
                })}\n\n`;
                controller.enqueue(encoder.encode(data));
                console.log(`📤 Status changed for ${id}:`, proj.devServerStatus, proj.devServerPort);

                // Adjust poll interval based on state
                if (proj.devServerStatus === 'starting') {
                  currentPollInterval = 1000; // 1s during startup (critical phase)
                } else if (proj.devServerStatus === 'running') {
                  currentPollInterval = 5000; // 5s when running (stable)
                } else {
                  currentPollInterval = 10000; // 10s when stopped/failed (rare changes)
                }
              } else {
                stableCount++;

                // If stable for 5 consecutive polls, slow down further
                if (stableCount >= 5 && proj.devServerStatus === 'running') {
                  currentPollInterval = 15000; // 15s when very stable
                }
              }
            }
          } catch (err) {
            console.error(`   Failed to poll project ${id}:`, err);
          }

          // Schedule next poll with current interval
          pollTimeout = setTimeout(doPoll, currentPollInterval);
        };

        // Start polling
        pollTimeout = setTimeout(doPoll, currentPollInterval);

        // Cleanup on connection close
        req.signal.addEventListener('abort', () => {
          console.log(`🔌 Client disconnected from status stream for ${id}`);
          if (keepaliveInterval) {
            clearInterval(keepaliveInterval);
          }
          if (pollTimeout) {
            clearTimeout(pollTimeout);
          }
          controller.close();
        });
      } catch (error) {
        console.error(`❌ Error starting status stream for ${id}:`, error);
        controller.error(error);
      }
    },

    cancel() {
      console.log(`🛑 Status stream cancelled for ${id}`);
      if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
      }
      if (pollTimeout) {
        clearTimeout(pollTimeout);
      }
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
