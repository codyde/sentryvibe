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
    const search = searchParams.get('search') || undefined;
    const level = searchParams.get('level') as 'all' | 'error' | 'warn' | undefined;

    if (stream) {
      // Streaming logs using Server-Sent Events
      const encoder = new TextEncoder();

      const customReadable = new ReadableStream({
        start(controller) {
          console.log(`📤 SSE stream started for ${id}`);

          // Send initial connected message to establish stream (fixes EventSource onopen not firing)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`));

          // Send existing logs
          const existingLogs = getRunnerLogs(id);
          console.log(`   Sending ${existingLogs.length} existing log entries (runner)`);

          for (const log of existingLogs) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'log', data: log.data, stream: log.type })}\n\n`));
          }

          // Start keepalive pings every 15 seconds
          const keepaliveInterval = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(':keepalive\n\n'));
            } catch (err) {
              console.log('   Keepalive failed, stream likely closed');
              clearInterval(keepaliveInterval);
            }
          }, 15000);

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
                clearInterval(keepaliveInterval);
                controller.close();
                unsubscribe();
              }
            } catch (err) {
              console.error('   ❌ Failed to forward runner log event:', err);
              clearInterval(keepaliveInterval);
              unsubscribe();
              controller.error(err);
            }
          });

          // Cleanup on connection close
          req.signal.addEventListener('abort', () => {
            console.log(`🔌 Client disconnected from log stream for ${id}`);
            clearInterval(keepaliveInterval);
            unsubscribe();
          });

          return () => {
            clearInterval(keepaliveInterval);
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
      // Return logs as JSON with filtering
      let logs = getRunnerLogs(id, limit);

      // Filter by search keyword (case-insensitive)
      if (search) {
        const searchLower = search.toLowerCase();
        logs = logs.filter(log => log.data.toLowerCase().includes(searchLower));
      }

      // Filter by log level
      if (level === 'error') {
        logs = logs.filter(log => {
          const lower = log.data.toLowerCase();
          return log.type === 'stderr' ||
                 lower.includes('error') ||
                 lower.includes('failed') ||
                 lower.includes('exception') ||
                 lower.includes('cannot') ||
                 lower.includes('missing');
        });
      } else if (level === 'warn') {
        logs = logs.filter(log => {
          const lower = log.data.toLowerCase();
          return lower.includes('warn') || lower.includes('warning');
        });
      }

      // Count errors and warnings
      const errorCount = logs.filter(log => {
        const lower = log.data.toLowerCase();
        return log.type === 'stderr' ||
               lower.includes('error') ||
               lower.includes('failed') ||
               lower.includes('exception');
      }).length;

      const warningCount = logs.filter(log => {
        const lower = log.data.toLowerCase();
        return lower.includes('warn') || lower.includes('warning');
      }).length;

      return NextResponse.json({
        logs,
        running: logs.length > 0,
        totalLines: logs.length,
        errorCount,
        warningCount,
        hasErrors: errorCount > 0,
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
