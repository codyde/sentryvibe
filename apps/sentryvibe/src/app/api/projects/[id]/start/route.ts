import { NextResponse } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { projects } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { 
  getRunCommand, 
  reserveOrReallocatePort, 
  buildEnvForFramework,
  withEnforcedPort
} from '@sentryvibe/agent-core/lib/port-allocator';
import { sendCommandToRunner } from '@sentryvibe/agent-core/lib/runner/broker-state';
import { getProjectRunnerId } from '@/lib/runner-utils';
import type { StartDevServerCommand } from '@/shared/runner/messages';

// POST /api/projects/:id/start - Start dev server
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

    const proj = project[0];

    // Try to use project's saved runner, fallback to any available runner
    const runnerId = await getProjectRunnerId(proj.runnerId);

    if (!runnerId) {
      return NextResponse.json(
        { error: 'No runners connected' },
        { status: 503 }
      );
    }

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
      console.log(`🚀 Starting dev server for ${proj.name}`);

      // Step 1: Allocate port BEFORE spawning (proactive allocation)
      const portInfo = await reserveOrReallocatePort({
        projectId: id,
        projectType: proj.projectType,
        runCommand: proj.runCommand,
        preferredPort: proj.devServerPort, // Try to reuse existing port if available
      });

      console.log(`📍 Allocated port ${portInfo.port} for framework ${portInfo.framework}`);

      // Step 2: Update database with allocated port BEFORE sending command
      // This makes devServerPort the single source of truth
      await db.update(projects)
        .set({
          devServerStatus: 'starting',
          devServerPort: portInfo.port,
          errorMessage: null,
          lastActivityAt: new Date(),
        })
        .where(eq(projects.id, id));

      // Step 3: Build environment variables to enforce port
      const portEnv = buildEnvForFramework(portInfo.framework, portInfo.port);

      // Step 4: Enforce port in command (for frameworks that need CLI flags)
      const baseCommand = getRunCommand(proj.runCommand);
      const enforcedCommand = withEnforcedPort(baseCommand, portInfo.framework, portInfo.port);
      
      console.log(`📝 Run command: ${enforcedCommand}`);
      console.log(`🔧 Port environment: ${JSON.stringify(portEnv)}`);

      // Step 5: Send command to runner with pre-allocated port
      const runnerCommand: StartDevServerCommand = {
        id: randomUUID(),
        type: 'start-dev-server',
        projectId: id,
        timestamp: new Date().toISOString(),
        payload: {
          runCommand: enforcedCommand,
          workingDirectory: proj.path,
          env: portEnv,
          preferredPort: portInfo.port,
        },
      };

      await sendCommandToRunner(runnerId, runnerCommand);

      return NextResponse.json({
        message: 'Dev server start requested',
        port: portInfo.port,
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
