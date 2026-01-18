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
    const commandId = randomUUID();
    // Type assertion needed until agent-core package is rebuilt
    const cancelCommand = {
      id: commandId,
      type: 'cancel-build' as const,
      projectId: id,
      timestamp: new Date().toISOString(),
      payload: {
        sessionId: session.id,
        reason,
      },
    } as unknown as RunnerCommand;
    
    const sent = sendCommandToRunner(runnerId, cancelCommand);

    if (!sent) {
      // Runner not connected - mark as cancelled in DB directly
      console.log('[cancel-build] Runner not connected, marking session as cancelled directly');
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
      message: 'Build cancelled',
      sessionId: session.id,
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
