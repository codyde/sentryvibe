import { NextResponse } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { projects } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import { sendCommandToRunner, listRunnerConnections } from '@sentryvibe/agent-core/lib/runner/broker-state';
import { randomUUID } from 'crypto';

// GET /api/projects/:id - Get single project
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await db.select().from(projects).where(eq(projects.id, id)).limit(1);

    if (project.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ project: project[0] });
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
}

// PATCH /api/projects/:id - Update project
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = await req.json();

    // Validate allowed fields
    const allowedFields = [
      'name', 'description', 'originalPrompt', 'icon', 'status', 'projectType', 'runCommand',
      'port', 'devServerPid', 'devServerPort', 'devServerStatus', 'generationState',
      'lastActivityAt', 'errorMessage'
    ];

    const filteredUpdates = Object.keys(updates)
      .filter(key => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = updates[key];
        return obj;
      }, {} as Record<string, unknown>);

    if (Object.keys(filteredUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const updated = await db.update(projects)
      .set(filteredUpdates)
      .where(eq(projects.id, id))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ project: updated[0] });
  } catch (error) {
    console.error('❌ Error updating project:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

// DELETE /api/projects/:id - Delete project
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { deleteFiles = false } = await req.json().catch(() => ({ deleteFiles: false }));

    // Get project details before deleting
    const project = await db.select().from(projects).where(eq(projects.id, id)).limit(1);

    if (project.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Kill dev server if running
    if (project[0].devServerPid) {
      try {
        process.kill(project[0].devServerPid);
        console.log(`🔪 Killed dev server process: ${project[0].devServerPid}`);
      } catch (error) {
        console.warn('Failed to kill process:', error);
      }
    }

    // Delete from database (cascade will delete messages and running_processes)
    await db.delete(projects).where(eq(projects.id, id));

    // Optionally delete filesystem - delegate to runner
    if (deleteFiles && project[0].slug) {
      try {
        const runnerId = process.env.RUNNER_DEFAULT_ID ?? 'default';

        // Check if runner is connected before trying to send command
        const connections = await listRunnerConnections();
        const runnerConnected = connections.some(conn => conn.id === runnerId);

        if (!runnerConnected) {
          console.warn(`⚠️  Runner '${runnerId}' not connected - skipping file deletion`);
          console.warn(`   Files in workspace may need manual cleanup: ${project[0].slug}`);
        } else {
          console.log(`🗑️  Sending delete-project-files command to runner: ${runnerId}`);
          console.log(`   Project slug: ${project[0].slug}`);

          // Send command to runner - it will delete files from its workspace
          await sendCommandToRunner(runnerId, {
            id: randomUUID(),
            type: 'delete-project-files',
            projectId: id,
            timestamp: new Date().toISOString(),
            payload: {
              slug: project[0].slug,
            },
          });

          console.log(`✅ Delete command sent to runner successfully`);
        }
      } catch (error) {
        console.warn('⚠️  Failed to send delete command to runner:', error);
        // Don't fail the request - project is already deleted from DB
      }
    } else if (deleteFiles) {
      console.warn('⚠️  Cannot delete files: project slug not found');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
