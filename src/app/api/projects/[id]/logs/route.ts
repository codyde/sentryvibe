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

    if (!processInfo) {
      // Return empty logs if process not running
      return NextResponse.json({
        logs: [],
        running: false,
      });
    }

    if (stream) {
      // Streaming logs using Server-Sent Events
      const encoder = new TextEncoder();

      const customReadable = new ReadableStream({
        start(controller) {
          // Send existing logs
          const existingLogs = getProcessLogs(id);
          existingLogs.forEach(log => {
            const data = `data: ${JSON.stringify({ type: 'log', data: log })}\n\n`;
            controller.enqueue(encoder.encode(data));
          });

          // Listen for new logs
          const logHandler = (logData: { timestamp: Date; type: string; data: string }) => {
            const data = `data: ${JSON.stringify({ type: 'log', data: logData.data })}\n\n`;
            controller.enqueue(encoder.encode(data));
          };

          const exitHandler = () => {
            const data = `data: ${JSON.stringify({ type: 'exit' })}\n\n`;
            controller.enqueue(encoder.encode(data));
            controller.close();
          };

          processInfo.emitter.on('log', logHandler);
          processInfo.emitter.once('exit', exitHandler);

          // Cleanup on close
          return () => {
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
