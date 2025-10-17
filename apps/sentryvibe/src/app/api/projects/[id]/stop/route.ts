import { NextResponse } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { projects } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { sendCommandToRunner } from '@sentryvibe/agent-core/lib/runner/broker-state';
import type { StopDevServerCommand } from '@/shared/runner/messages';

// POST /api/projects/:id/stop - Stop dev server
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const runnerId = body.runnerId || process.env.RUNNER_DEFAULT_ID || 'default';

    // Get project from DB
    const project = await db.select().from(projects).where(eq(projects.id, id)).limit(1);

    if (project.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

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
