import { randomUUID } from 'crypto';
import { sendCommandToRunner } from '@sentryvibe/agent-core/lib/runner/broker-state';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { generationSessions } from '@sentryvibe/agent-core/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireProjectOwnership } from '@/lib/auth-helpers';
import { buildWebSocketServer } from '@sentryvibe/agent-core/lib/websocket/server';
import type { RunnerCommand } from '@sentryvibe/agent-core/shared/runner/messages';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify user owns this project
    const { project } = await requireProjectOwnership(id);

    const body = await req.json().catch(() => ({}));
    const reason = body.reason || 'User cancelled';

    // Find active session for this project
    const activeSessions = await db
      .select()
      .from(generationSessions)
      .where(
        and(
          eq(generationSessions.projectId, id),
          eq(generationSessions.status, 'active')
        )
      )
      .limit(1);

    if (activeSessions.length === 0) {
      return new Response(JSON.stringify({ error: 'No active build to cancel' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const session = activeSessions[0];

    // Get runner ID for this project
    const runnerId = project.runnerId || process.env.RUNNER_DEFAULT_ID || 'default';

    // Send cancel command to runner
    // Note: Runner looks up active build by projectId, so buildCommandId is optional
    const commandId = randomUUID();
    const cancelCommand = {
      id: commandId,
      type: 'cancel-build' as const,
      projectId: id,
      timestamp: new Date().toISOString(),
      payload: {
        buildCommandId: session.buildId, // Use buildId as correlation ID
        sessionId: session.id,
        reason,
      },
    } as RunnerCommand;
    
    let runnerNotified = false;
    try {
      await sendCommandToRunner(runnerId, cancelCommand);
      runnerNotified = true;
      console.log(`[cancel-build] Cancel command sent to runner ${runnerId}`);
    } catch (err) {
      // Runner not connected - we'll still mark as cancelled in DB
      // The build process will fail when it tries to report progress
      console.log('[cancel-build] Runner not connected, marking session as cancelled directly:', err);
    }

    // Update session status in database
    await db
      .update(generationSessions)
      .set({
        status: 'cancelled',
        endedAt: new Date(),
        summary: `Build cancelled: ${reason}`,
        updatedAt: new Date(),
      })
      .where(eq(generationSessions.id, session.id));

    // Broadcast cancellation to WebSocket clients
    buildWebSocketServer.broadcastBuildComplete(
      id,
      session.id,
      'failed',
      `Build cancelled: ${reason}`
    );

    return new Response(JSON.stringify({ 
      success: true, 
      message: runnerNotified ? 'Build cancelled' : 'Build marked as cancelled (runner not connected)',
      sessionId: session.id,
      runnerNotified,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[cancel-build] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to cancel build' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
