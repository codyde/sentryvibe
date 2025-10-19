import { NextRequest } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { projects } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import { projectEvents } from '@/lib/project-events';

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

        // Event-driven updates: listen for project changes
        const handleProjectUpdate = (project: any) => {
          try {
            const data = `data: ${JSON.stringify({
              type: 'status-update',
              project,
            })}\n\n`;
            controller.enqueue(encoder.encode(data));
            console.log(`📤 Event-driven update for ${id}:`, {
              status: project.devServerStatus,
              port: project.devServerPort,
              tunnel: project.tunnelUrl,
            });
          } catch (err) {
            console.error(`   Failed to send update for ${id}:`, err);
          }
        };

        // Subscribe to project events
        projectEvents.onProjectUpdate(id, handleProjectUpdate);

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
                console.log(`🔄 Sending state update for ${id} (periodic check)`);
                lastSentState = currentState;
                const data = `data: ${JSON.stringify({
                  type: 'status-update',
                  project: proj,
                })}\n\n`;
                controller.enqueue(encoder.encode(data));
              }
            }
          } catch (err) {
            console.error(`   Failed to send state update for ${id}:`, err);
          }
        };

        // Initial fallback after 1 second
        setTimeout(sendLatestState, 1000);

        // Periodic safety check every 5 seconds
        const periodicCheck = setInterval(sendLatestState, 5000);

        // Cleanup on connection close
        req.signal.addEventListener('abort', () => {
          console.log(`🔌 Client disconnected from status stream for ${id}`);
          if (keepaliveInterval) {
            clearInterval(keepaliveInterval);
          }
          if (periodicCheck) {
            clearInterval(periodicCheck);
          }
          projectEvents.offProjectUpdate(id, handleProjectUpdate);
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
