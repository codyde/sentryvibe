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
 * Unregister a process when it exits
 * DELETE /api/runner/process/:projectId
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    if (!ensureAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;

    await db.delete(runningProcesses)
      .where(eq(runningProcesses.projectId, projectId));

    console.log(`✅ Unregistered process for project ${projectId}`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to unregister process:', error);
    return NextResponse.json(
      { error: 'Failed to unregister process' },
      { status: 500 }
    );
  }
}
