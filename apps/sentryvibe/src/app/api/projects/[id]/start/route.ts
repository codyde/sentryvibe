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
      // Skip local port availability checks for remote runners (they run on different machines)
      const isRemoteRunner = runnerId !== 'local';
      const portInfo = await reserveOrReallocatePort({
        projectId: id,
        projectType: proj.projectType,
        runCommand: proj.runCommand,
        preferredPort: proj.devServerPort, // Try to reuse existing port if available
        detectedFramework: proj.detectedFramework, // Framework detected during build
      }, isRemoteRunner); // Skip port check for remote runners

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
      // Extract and enhance error message for better user feedback
      let errorMessage = 'Failed to start dev server';
      let userFriendlyMessage = errorMessage;
      
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // Provide user-friendly messages for common port allocation errors
        if (errorMessage.includes('All ports in range')) {
          const match = errorMessage.match(/(\d+)-(\d+)/);
          if (match) {
            const [, start, end] = match;
            userFriendlyMessage = 
              `All ports (${start}-${end}) are currently in use. ` +
              `Please stop other dev servers to free up ports.`;
          } else {
            userFriendlyMessage = 'All available ports are in use. Please stop other dev servers.';
          }
        } else if (errorMessage.includes('No available ports')) {
          userFriendlyMessage = 'No available ports found. Please stop other dev servers or check your system.';
        } else if (errorMessage.includes('Unable to allocate port')) {
          userFriendlyMessage = 'Could not allocate a port. Please ensure ports are available.';
        } else {
          // Use the original error message if it's already clear
          userFriendlyMessage = errorMessage;
        }
      }

      // Update project status with user-friendly error message
      await db.update(projects)
        .set({
          devServerStatus: 'failed',
          devServerPort: null,
          errorMessage: userFriendlyMessage,
        })
        .where(eq(projects.id, id));

      // Re-throw with enhanced message
      const enhancedError = new Error(userFriendlyMessage);
      enhancedError.stack = error instanceof Error ? error.stack : undefined;
      throw enhancedError;
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
