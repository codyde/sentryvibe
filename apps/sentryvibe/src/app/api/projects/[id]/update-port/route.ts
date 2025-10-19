import { NextResponse } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { projects } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import { projectCache } from '@sentryvibe/agent-core/lib/cache/project-cache';

// PATCH /api/projects/:id/update-port - Update detected port
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { port } = await req.json();

    if (!port || typeof port !== 'number') {
      return NextResponse.json({ error: 'Invalid port' }, { status: 400 });
    }

    console.log(`🔍 Updating port for project ${id} to ${port}`);

    // Update the port in the database
    await db.update(projects)
      .set({
        devServerPort: port,
        lastActivityAt: new Date(),
      })
      .where(eq(projects.id, id));

    // Invalidate cache since project port changed
    projectCache.invalidate(id);

    return NextResponse.json({ success: true, port });
  } catch (error) {
    console.error('Error updating port:', error);
    return NextResponse.json(
      {
        error: 'Failed to update port',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
