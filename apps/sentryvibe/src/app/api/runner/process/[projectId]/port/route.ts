import { NextResponse } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { runningProcesses } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';

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
 * Update the detected port for a running process
 * PATCH /api/runner/process/:projectId/port
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    if (!ensureAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const { port } = await request.json();

    if (!port || typeof port !== 'number') {
      return NextResponse.json(
        { error: 'Missing or invalid port' },
        { status: 400 }
      );
    }

    await db.update(runningProcesses)
      .set({
        port,
        lastHealthCheck: new Date(),
      })
      .where(eq(runningProcesses.projectId, projectId));

    console.log(`✅ Updated port for project ${projectId}: ${port}`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to update port:', error);
    return NextResponse.json(
      { error: 'Failed to update port' },
      { status: 500 }
    );
  }
}
