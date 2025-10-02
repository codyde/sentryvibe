import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { stopDevServer } from '@/lib/process-manager';

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

    const proj = project[0];

    // Stop the process
    const stopped = stopDevServer(id);

    // Also try to kill by PID if we have it (for orphaned processes)
    if (proj.devServerPid && !stopped) {
      try {
        process.kill(proj.devServerPid, 'SIGTERM');

        // Force kill after 2 seconds
        setTimeout(() => {
          try {
            if (proj.devServerPid) {
              process.kill(proj.devServerPid, 'SIGKILL');
            }
          } catch {}
        }, 2000);

        console.log(`Killed orphaned process ${proj.devServerPid}`);
      } catch (error) {
        console.warn('Failed to kill process by PID:', error);
      }
    }

    // Update DB
    await db.update(projects)
      .set({
        devServerPid: null,
        devServerPort: null,
        devServerStatus: 'stopped',
        lastActivityAt: new Date(),
      })
      .where(eq(projects.id, id));

    return NextResponse.json({
      message: 'Dev server stopped',
      stopped: stopped || !!proj.devServerPid,
    });

  } catch (error) {
    console.error('Error stopping dev server:', error);
    return NextResponse.json(
      {
        error: 'Failed to stop dev server',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
