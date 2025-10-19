import { NextResponse } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { projects } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { sendCommandToRunner } from '@sentryvibe/agent-core/lib/runner/broker-state';
import { getProjectRunnerId } from '@/lib/runner-utils';
import type { StopTunnelCommand } from '@/shared/runner/messages';

// POST /api/projects/:id/stop-tunnel - Stop tunnel for dev server
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

    // Check if tunnel exists
    if (!proj.tunnelUrl) {
      return NextResponse.json({
        message: 'No tunnel to stop',
      });
    }

    // Check if we have a port to close the tunnel
    if (!proj.devServerPort) {
      return NextResponse.json({
        error: 'No port information available to close tunnel'
      }, { status: 400 });
    }

    const runnerCommand: StopTunnelCommand = {
      id: randomUUID(),
      type: 'stop-tunnel',
      projectId: id,
      timestamp: new Date().toISOString(),
      payload: {
        port: proj.devServerPort,
      },
    };

    await sendCommandToRunner(runnerId, runnerCommand);

    return NextResponse.json({
      message: 'Tunnel stop requested',
      port: proj.devServerPort,
    }, { status: 202 });

  } catch (error) {
    console.error('Error stopping tunnel:', error);

    if (error instanceof Error && /not connected/i.test(error.message)) {
      return NextResponse.json(
        { error: 'Runner is not connected' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to stop tunnel',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
