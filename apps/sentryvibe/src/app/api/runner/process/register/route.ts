import { NextResponse } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { runningProcesses } from '@sentryvibe/agent-core/lib/db/schema';

function ensureAuthorized(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expected = process.env.RUNNER_SHARED_SECRET;

  if (!expected) {
    throw new Error('RUNNER_SHARED_SECRET is not configured');
  }

  if (!authHeader?.startsWith('Bearer ') || authHeader.slice('Bearer '.length).trim() !== expected) {
    return false;
  }
  return true;
}

/**
 * Register a new process when the runner starts it
 * POST /api/runner/process/register
 */
export async function POST(request: Request) {
  try {
    if (!ensureAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, pid, command, port, startedAt, runnerId } = await request.json();

    if (!projectId || !pid || !command) {
      return NextResponse.json(
        { error: 'Missing required fields: projectId, pid, command' },
        { status: 400 }
      );
    }

    await db.insert(runningProcesses)
      .values({
        projectId,
        pid,
        command,
        port: port || null,
        runnerId: runnerId || null,
        startedAt: new Date(startedAt || Date.now()),
        healthCheckFailCount: 0,
      })
      .onConflictDoUpdate({
        target: runningProcesses.projectId,
        set: {
          pid,
          command,
          port: port || null,
          runnerId: runnerId || null,
          startedAt: new Date(startedAt || Date.now()),
          healthCheckFailCount: 0,
        },
      });

    console.log(`✅ Registered process: projectId=${projectId}, pid=${pid}, runnerId=${runnerId}`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to register process:', error);
    return NextResponse.json(
      { error: 'Failed to register process' },
      { status: 500 }
    );
  }
}
