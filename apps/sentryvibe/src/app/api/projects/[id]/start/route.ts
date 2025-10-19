import { NextResponse } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { projects } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getRunCommand } from '@sentryvibe/agent-core/lib/port-allocator';
import { sendCommandToRunner } from '@sentryvibe/agent-core/lib/runner/broker-state';
import type { StartDevServerCommand } from '@/shared/runner/messages';
import { projectCache } from '@sentryvibe/agent-core/lib/cache/project-cache';

// POST /api/projects/:id/start - Start dev server
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

    const proj = project[0];

    // Check if already running
    if (proj.devServerStatus === 'running' && proj.devServerPid) {
      return NextResponse.json({
        message: 'Dev server already running',
        pid: proj.devServerPid,
        port: proj.devServerPort,
      });
    }

    // Ensure we have a run command
    if (!proj.runCommand) {
      return NextResponse.json({
        error: 'No run command configured for this project'
      }, { status: 400 });
    }

    if (!proj.path) {
      return NextResponse.json({
        error: 'Project path is not set'
      }, { status: 400 });
    }

    try {
      // No port reservation - let framework auto-increment if needed
      console.log(`🚀 Starting dev server for ${proj.name}`);

      // Update status to starting and clear any previous errors
      await db.update(projects)
        .set({
          devServerStatus: 'starting',
          devServerPort: null, // Will be detected from stdout
          errorMessage: null,
          lastActivityAt: new Date(),
        })
        .where(eq(projects.id, id));

      // Invalidate cache since project status changed
      projectCache.invalidate(id);

      const baseCommand = getRunCommand(proj.runCommand);
      console.log(`📝 Run command: ${baseCommand}`);

      const runnerCommand: StartDevServerCommand = {
        id: randomUUID(),
        type: 'start-dev-server',
        projectId: id,
        timestamp: new Date().toISOString(),
        payload: {
          runCommand: baseCommand,
          workingDirectory: proj.path,
          env: {}, // No port enforcement
          preferredPort: null,
        },
      };

      await sendCommandToRunner(runnerId, runnerCommand);

      return NextResponse.json({
        message: 'Dev server start requested',
      }, { status: 202 });

    } catch (error) {
      // Update status to failed
      await db.update(projects)
        .set({
          devServerStatus: 'failed',
          devServerPort: null,
          errorMessage: error instanceof Error ? error.message : 'Failed to start dev server',
        })
        .where(eq(projects.id, id));

      // Invalidate cache since project status changed
      projectCache.invalidate(id);

      throw error;
    }

  } catch (error) {
    console.error('Error starting dev server:', error);

    if (error instanceof Error && /not connected/i.test(error.message)) {
      return NextResponse.json(
        { error: 'Runner is not connected' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to start dev server',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
