import { NextResponse } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { runningProcesses, projects, runnerKeys } from '@sentryvibe/agent-core/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { authenticateRunnerRequest, authenticateRunnerKey, extractRunnerKey, isLocalMode } from '@/lib/auth-helpers';

/**
 * Get list of running processes for health checking
 * GET /api/runner/process/list?runnerId=xxx (optional filter)
 * 
 * In SaaS mode, only returns processes for projects owned by the authenticated user
 */
export async function GET(request: Request) {
  try {
    if (!await authenticateRunnerRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const runnerId = searchParams.get('runnerId');

    // In local mode, return all processes (no multi-tenancy)
    if (isLocalMode()) {
      let processes;
      if (runnerId) {
        processes = await db.select().from(runningProcesses).where(eq(runningProcesses.runnerId, runnerId));
      } else {
        processes = await db.select().from(runningProcesses);
      }
      return NextResponse.json({ processes });
    }

    // In SaaS mode, get the userId from the runner key to filter processes
    const runnerKey = extractRunnerKey(request);
    if (!runnerKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authResult = await authenticateRunnerKey(runnerKey);
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get project IDs owned by this user
    const userProjects = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.userId, authResult.userId));

    const projectIds = userProjects.map(p => p.id);

    if (projectIds.length === 0) {
      return NextResponse.json({ processes: [] });
    }

    // Filter processes by user's projects and optionally by runnerId
    let processes;
    if (runnerId) {
      processes = await db
        .select()
        .from(runningProcesses)
        .where(
          and(
            eq(runningProcesses.runnerId, runnerId),
            inArray(runningProcesses.projectId, projectIds)
          )
        );
    } else {
      processes = await db
        .select()
        .from(runningProcesses)
        .where(inArray(runningProcesses.projectId, projectIds));
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
