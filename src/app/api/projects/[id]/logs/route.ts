import { NextResponse } from 'next/server';
import { getProcessInfo, getProcessLogs } from '@/lib/process-manager';

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

    const processInfo = getProcessInfo(id);

    console.log(`📡 Logs request for ${id}, stream=${stream}, processInfo=${!!processInfo}`);

    if (!processInfo) {
      console.log('⚠️  No process info found for', id);

      // For streaming requests, we need to return SSE format even if no process
      if (stream) {
        const encoder = new TextEncoder();
        const customReadable = new ReadableStream({
          start(controller) {
            // Send empty message and close
            const data = `data: ${JSON.stringify({ type: 'no-process', message: 'No dev server running' })}\n\n`;
            controller.enqueue(encoder.encode(data));
            controller.close();
          },
        });

        return new Response(customReadable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      }

      // Return empty logs if process not running
      return NextResponse.json({
        logs: [],
        running: false,
      });
    }

    console.log(`✅ Found process for ${id}, PID: ${processInfo.pid}`);

    if (stream) {
      // Streaming logs using Server-Sent Events
      const encoder = new TextEncoder();

      const customReadable = new ReadableStream({
        start(controller) {
          console.log(`📤 SSE stream started for ${id}`);

          let isClosed = false;

          // Send existing logs
          const existingLogs = getProcessLogs(id);
          console.log(`   Sending ${existingLogs.length} existing log entries`);

          existingLogs.forEach(log => {
            if (!isClosed) {
              const data = `data: ${JSON.stringify({ type: 'log', data: log })}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
          });

          // Listen for new logs
          const logHandler = (logData: { timestamp: Date; type: string; data: string }) => {
            if (isClosed) {
              console.log(`   ⚠️  Skipping log event - controller closed`);
              return;
            }

            try {
              console.log(`   📨 New log event emitted`);
              const data = `data: ${JSON.stringify({ type: 'log', data: logData.data })}\n\n`;
              controller.enqueue(encoder.encode(data));
            } catch (error) {
              console.error(`   ❌ Failed to enqueue log:`, error);
              isClosed = true;
            }
          };

          const exitHandler = (payload?: { code?: number | null; signal?: NodeJS.Signals | null }) => {
            if (isClosed) return;

            try {
              console.log(`   ⚠️  Exit event received`);
              const data = `data: ${JSON.stringify({ type: 'exit', payload })}\n\n`;
              controller.enqueue(encoder.encode(data));
              controller.close();
              isClosed = true;
            } catch (error) {
              console.error(`   ❌ Failed to close controller:`, error);
              isClosed = true;
            }
          };

          processInfo.emitter.on('log', logHandler);
          processInfo.emitter.once('exit', exitHandler);

          console.log(`   ✅ Event listeners attached`);

          // Cleanup on close
          return () => {
            console.log(`   🧹 Cleaning up SSE stream for ${id}`);
            isClosed = true;
            processInfo.emitter.off('log', logHandler);
            processInfo.emitter.off('exit', exitHandler);
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
      const logs = getProcessLogs(id, limit);

      return NextResponse.json({
        logs,
        running: true,
        pid: processInfo.pid,
        startTime: processInfo.startTime,
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
