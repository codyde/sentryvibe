import { NextResponse } from 'next/server';
import { sendCommandToRunner } from '@sentryvibe/agent-core/lib/runner/broker-state';
import type { RunnerCommand } from '@/shared/runner/messages';
import { requireProjectOwnership, handleAuthError } from '@/lib/auth-helpers';

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as RunnerCommand & { runnerId?: string };
    const runnerId = payload.runnerId ?? process.env.RUNNER_DEFAULT_ID ?? 'default';
    const { runnerId: _ignored, ...command } = payload;

    if (!command.type || !command.projectId) {
      return NextResponse.json({ error: 'Invalid command payload' }, { status: 400 });
    }

    // Verify user owns the project before sending commands
    await requireProjectOwnership(command.projectId);

    await sendCommandToRunner(runnerId, { ...command, timestamp: command.timestamp ?? new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch (error) {
    // Handle auth errors (401, 403, 404)
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    
    console.error('Failed to dispatch runner command:', error);
    return NextResponse.json({ error: 'Failed to dispatch command' }, { status: 500 });
  }
}
