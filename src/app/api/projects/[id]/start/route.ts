import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { startDevServer } from '@/lib/process-manager';
import { findAvailablePort, getRunCommandWithPort } from '@/lib/port-allocator';

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

    // Update status to starting
    await db.update(projects)
      .set({
        devServerStatus: 'starting',
        lastActivityAt: new Date(),
      })
      .where(eq(projects.id, id));

    try {
      // Find an available port
      const availablePort = await findAvailablePort(proj.port || undefined);
      console.log(`🔍 Allocated port ${availablePort} for ${proj.name}`);

      // Get port-specific command
      const commandWithPort = getRunCommandWithPort(proj.projectType, proj.runCommand, availablePort);
      console.log(`📝 Run command: ${commandWithPort}`);

      // Start the dev server
      const { pid, port, emitter } = startDevServer({
        projectId: id,
        command: commandWithPort,
        cwd: proj.path,
      });

      // Listen for port detection with allocated port as fallback
      let detectedPort = port;
      const portPromise = new Promise<number>((resolve) => {
        // If no port detected after 8s, use the allocated port
        const timeout = setTimeout(() => {
          const fallbackPort = detectedPort || availablePort;
          console.log(`⏱️  Port detection timeout, using allocated port: ${fallbackPort}`);
          resolve(fallbackPort);
        }, 8000); // 8s timeout (increased for slower starts)

        emitter.once('port', (p: number) => {
          clearTimeout(timeout);
          detectedPort = p;
          console.log(`✅ Port detected from output: ${p}`);
          resolve(p);
        });
      });

      // Wait for port detection
      const finalPort = await portPromise;
      console.log(`📍 Final port for ${proj.name}: ${finalPort}`);

      // Update DB with running status
      await db.update(projects)
        .set({
          devServerPid: pid,
          devServerPort: finalPort,
          devServerStatus: 'running',
          lastActivityAt: new Date(),
        })
        .where(eq(projects.id, id));

      // Handle process exit
      emitter.once('exit', async (code: number) => {
        console.log(`Dev server for ${id} exited with code ${code}`);
        await db.update(projects)
          .set({
            devServerPid: null,
            devServerPort: null,
            devServerStatus: code === 0 ? 'stopped' : 'failed',
          })
          .where(eq(projects.id, id));
      });

      // Handle process errors
      emitter.once('error', async (error: Error) => {
        console.error(`Dev server error for ${id}:`, error);
        await db.update(projects)
          .set({
            devServerPid: null,
            devServerPort: null,
            devServerStatus: 'failed',
            errorMessage: error.message,
          })
          .where(eq(projects.id, id));
      });

      return NextResponse.json({
        message: 'Dev server started',
        pid,
        port: finalPort,
      });

    } catch (error) {
      // Update status to failed
      await db.update(projects)
        .set({
          devServerStatus: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Failed to start dev server',
        })
        .where(eq(projects.id, id));

      throw error;
    }

  } catch (error) {
    console.error('Error starting dev server:', error);
    return NextResponse.json(
      {
        error: 'Failed to start dev server',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
