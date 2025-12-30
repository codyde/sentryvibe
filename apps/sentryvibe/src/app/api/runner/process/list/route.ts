import { NextResponse } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { runningProcesses } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import { authenticateRunnerRequest } from '@/lib/auth-helpers';

/**
 * Get list of running processes for health checking
 * GET /api/runner/process/list?runnerId=xxx (optional filter)
 */
export async function GET(request: Request) {
  try {
    if (!await authenticateRunnerRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const runnerId = searchParams.get('runnerId');

    let processes;
    if (runnerId) {
      // Filter by runner ID if provided
      processes = await db.select().from(runningProcesses).where(eq(runningProcesses.runnerId, runnerId));
    } else {
      // Return all processes if no filter
      processes = await db.select().from(runningProcesses);
    }

    return NextResponse.json({ processes });
  } catch (error) {
    console.error('Failed to fetch running processes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch running processes' },
      { status: 500 }
    );
  }
}
