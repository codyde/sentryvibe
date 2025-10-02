import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { rm } from 'fs/promises';

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
      'port', 'devServerPid', 'devServerPort', 'devServerStatus',
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
    console.error('Error updating project:', error);
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

    // Delete from database (cascade will delete messages)
    await db.delete(projects).where(eq(projects.id, id));

    // Optionally delete filesystem
    if (deleteFiles && project[0].path) {
      try {
        await rm(project[0].path, { recursive: true, force: true });
        console.log(`🗑️  Deleted project files: ${project[0].path}`);
      } catch (error) {
        console.warn('Failed to delete project files:', error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
