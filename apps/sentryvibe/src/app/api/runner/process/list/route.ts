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
 * Get list of running processes for health checking
 * GET /api/runner/process/list
 */
export async function GET(request: Request) {
  try {
    if (!ensureAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const processes = await db.select().from(runningProcesses);

    return NextResponse.json({ processes });
  } catch (error) {
    console.error('Failed to fetch running processes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch running processes' },
      { status: 500 }
    );
  }
}
