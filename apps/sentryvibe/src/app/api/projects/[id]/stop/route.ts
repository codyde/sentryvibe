import { NextResponse } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { projects } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { releasePortForProject } from '@sentryvibe/agent-core/lib/port-allocator';
import { sendCommandToRunner } from '@sentryvibe/agent-core/lib/runner/broker-state';
import { getProjectRunnerId } from '@/lib/runner-utils';
import type { StopDevServerCommand } from '@/shared/runner/messages';

// POST /api/projects/:id/stop - Stop dev server
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get project from DB
    const project = await db.select().from(projects).where(eq(projects.id, id)).limit(1);

    if (project.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Try to use project's saved runner, fallback to any available runner
    const runnerId = await getProjectRunnerId(project[0].runnerId);

    if (!runnerId) {
      return NextResponse.json(
        { error: 'No runners connected' },
        { status: 503 }
      );
    }

    // Update status to stopping
    await db.update(projects)
      .set({
        devServerStatus: 'stopping',
        lastActivityAt: new Date(),
      })
      .where(eq(projects.id, id));

    const command: StopDevServerCommand = {
      id: randomUUID(),
      type: 'stop-dev-server',
      projectId: id,
      timestamp: new Date().toISOString(),
    };

    await sendCommandToRunner(runnerId, command);

    // Release port allocation immediately
    // The runner will handle killing the process, but we free the port now
    await releasePortForProject(id);
    
    // Clear port and tunnel info from database
    await db.update(projects)
      .set({
        devServerPort: null,
        tunnelUrl: null,
        devServerStatus: 'stopped',
        lastActivityAt: new Date(),
      })
      .where(eq(projects.id, id));

    console.log(`🛑 Released port allocation for project ${id}`);

    return NextResponse.json({
      message: 'Dev server stop requested',
    }, { status: 202 });

  } catch (error) {
    console.error('Error stopping dev server:', error);

    if (error instanceof Error && /not connected/i.test(error.message)) {
      return NextResponse.json(
        { error: 'Runner is not connected' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to stop dev server',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
