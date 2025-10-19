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

        // Poll database for changes every 2 seconds
        // (Lighter than 500ms polling, still responsive)
        const pollInterval = setInterval(async () => {
          try {
            const updatedProject = await db.select()
              .from(projects)
              .where(eq(projects.id, id))
              .limit(1);

            if (updatedProject.length > 0) {
              const data = `data: ${JSON.stringify({
                type: 'status-update',
                project: updatedProject[0],
              })}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
          } catch (err) {
            console.error(`   Failed to poll project ${id}:`, err);
          }
        }, 2000);

        // Cleanup on connection close
        req.signal.addEventListener('abort', () => {
          console.log(`🔌 Client disconnected from status stream for ${id}`);
          if (keepaliveInterval) {
            clearInterval(keepaliveInterval);
          }
          clearInterval(pollInterval);
          controller.close();
        });

        // Store intervals for cleanup
        (controller as any)._intervals = { keepaliveInterval, pollInterval };
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
