import { NextResponse } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { projects } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import * as Sentry from '@sentry/nextjs';
import { metrics } from '@sentry/core';
import { sendCommandToRunner } from '@sentryvibe/agent-core/lib/runner/broker-state';
import { getProjectRunnerId } from '@/lib/runner-utils';
import { randomUUID } from 'crypto';

// GET /api/projects/:id - Get single project
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await Sentry.startSpan(
      {
        name: 'db.query.projects.byId',
        op: 'db.query',
        attributes: { 'db.table': 'projects', 'project.id': id },
      },
      async () => {
        return await db.select().from(projects).where(eq(projects.id, id)).limit(1);
      }
    );

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
  // Check for trace context from frontend (sent via WebSocket from AI operations)
  const sentryTrace = req.headers.get('sentry-trace');
  const baggage = req.headers.get('baggage');
  
  // DEBUG: Log trace context reception
  if (sentryTrace) {
    console.log('[PATCH /api/projects/[id]] 🔗 Received trace context:', {
      trace: sentryTrace.substring(0, 40) + '...',
      hasBaggage: !!baggage,
    });
  } else {
    console.log('[PATCH /api/projects/[id]] ⚠️ No trace context in headers');
  }
  
  const executeUpdate = async () => {
    const { id } = await params;
    const updates = await req.json();

    // Validate allowed fields
    const allowedFields = [
      'name', 'description', 'originalPrompt', 'icon', 'status', 'projectType', 'runCommand',
      'port', 'devServerPid', 'devServerPort', 'devServerStatus', 'runnerId', 'generationState',
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

    // Wrap database update in span for tracing
    const updated = await Sentry.startSpan(
      {
        name: `api.projects.update${filteredUpdates.generationState ? '.generationState' : ''}`,
        op: 'db.update',
        attributes: {
          'project.id': id,
          'update.fields': Object.keys(filteredUpdates).join(','),
          'update.hasGenerationState': !!filteredUpdates.generationState,
        },
      },
      async () => {
        return await db.update(projects)
          .set(filteredUpdates)
          .where(eq(projects.id, id))
          .returning();
      }
    );

    if (updated.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ project: updated[0] });
  };
  
  // If trace context from AI operation exists, continue that trace
  // This links frontend PATCH requests to the backend AI operations
  if (sentryTrace && baggage) {
    return await Sentry.continueTrace(
      { sentryTrace, baggage },
      async () => {
        try {
          return await executeUpdate();
        } catch (error) {
          console.error('❌ Error updating project:', error);
          return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
        }
      }
    );
  }
  
  // No trace context, execute normally
  try {
    return await executeUpdate();
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

    // Instrument project deletion metric
    metrics.count('project_delete', 1, {
      attributes: {
        project_id: id,
        delete_files: deleteFiles.toString(),
        had_dev_server: (!!project[0].devServerPid).toString()
      }
    });

    // Optionally delete filesystem - delegate to runner
    if (deleteFiles && project[0].slug) {
      try {
        // Try to use project's saved runner, fallback to any available runner
        const runnerId = await getProjectRunnerId(project[0].runnerId);

        if (!runnerId) {
          console.warn(`⚠️  No runners connected - skipping file deletion`);
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
