import { NextResponse } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { projects } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { createConnection } from 'net';
import { sendCommandToRunner } from '@sentryvibe/agent-core/lib/runner/broker-state';
import { getProjectRunnerId } from '@/lib/runner-utils';
import type { StartTunnelCommand } from '@/shared/runner/messages';

/**
 * Check if a port is reachable (has a server listening)
 */
async function isPortReachable(port: number, host: string = 'localhost', timeout: number = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host, timeout });
    
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

// POST /api/projects/:id/start-tunnel - Start tunnel for dev server
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

    // Skip port reachability check for remote runners (API can't reach runner's localhost)
    // The runner's health check already verified the port is listening
    const isRemoteRunner = runnerId !== 'local';
    if (!isRemoteRunner) {
      // Only check reachability for local runners (same machine as API)
      const isReachable = await isPortReachable(proj.devServerPort);
      if (!isReachable) {
        return NextResponse.json({
          error: `Port ${proj.devServerPort} is not reachable yet. Please wait for the dev server to finish starting.`
        }, { status: 400 });
      }
    } else {
      console.log(`[start-tunnel] Skipping port reachability check for remote runner ${runnerId}`);
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
