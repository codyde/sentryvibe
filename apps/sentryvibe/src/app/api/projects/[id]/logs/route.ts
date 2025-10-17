import { NextResponse } from 'next/server';
import { getRunnerLogs, subscribeToRunnerLogs } from '@sentryvibe/agent-core/lib/runner/log-store';

// GET /api/projects/:id/logs - Get dev server logs
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const stream = searchParams.get('stream') === 'true';
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;

    if (stream) {
      // Streaming logs using Server-Sent Events
      const encoder = new TextEncoder();

      const customReadable = new ReadableStream({
        start(controller) {
          console.log(`📤 SSE stream started for ${id}`);

          // Send existing logs
          const existingLogs = getRunnerLogs(id);
          console.log(`   Sending ${existingLogs.length} existing log entries (runner)`);

          for (const log of existingLogs) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'log', data: log.data, stream: log.type })}\n\n`));
          }

          const unsubscribe = subscribeToRunnerLogs(id, (event) => {
            try {
              if (event.type === 'log') {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'log',
                      data: event.entry.data,
                      stream: event.entry.type,
                    })}\n\n`
                  )
                );
              } else if (event.type === 'exit') {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: 'exit', payload: event.payload })}\n\n`
                  )
                );
                controller.close();
                unsubscribe();
              }
            } catch (err) {
              console.error('   ❌ Failed to forward runner log event:', err);
              unsubscribe();
              controller.error(err);
            }
          });

          return () => {
            unsubscribe();
          };
        },
      });

      return new Response(customReadable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      // Return logs as JSON
      const logs = getRunnerLogs(id, limit);

      return NextResponse.json({
        logs,
        running: logs.length > 0,
      });
    }

  } catch (error) {
    console.error('Error fetching logs:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch logs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
