import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { sendCommandToRunner } from '@/lib/runner/broker-state';
import type { StartTunnelCommand } from '@/shared/runner/messages';

// POST /api/projects/:id/start-tunnel - Start tunnel for dev server
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

    // Check if dev server is running
    if (proj.devServerStatus !== 'running' || !proj.devServerPort) {
      return NextResponse.json({
        error: 'Dev server is not running. Start the dev server first.'
      }, { status: 400 });
    }

    // Check if tunnel already exists
    if (proj.tunnelUrl) {
      return NextResponse.json({
        message: 'Tunnel already exists',
        tunnelUrl: proj.tunnelUrl,
      });
    }

    const runnerCommand: StartTunnelCommand = {
      id: randomUUID(),
      type: 'start-tunnel',
      projectId: id,
      timestamp: new Date().toISOString(),
      payload: {
        port: proj.devServerPort,
      },
    };

    await sendCommandToRunner(runnerId, runnerCommand);

    return NextResponse.json({
      message: 'Tunnel start requested',
      port: proj.devServerPort,
    }, { status: 202 });

  } catch (error) {
    console.error('Error starting tunnel:', error);

    if (error instanceof Error && /not connected/i.test(error.message)) {
      return NextResponse.json(
        { error: 'Runner is not connected' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to start tunnel',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
