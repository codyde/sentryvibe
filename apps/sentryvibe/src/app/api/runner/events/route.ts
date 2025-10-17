import { NextResponse } from 'next/server';
import type { RunnerEvent } from '@/shared/runner/messages';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { projects } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import { releasePortForProject, updatePortReservationForProject } from '@sentryvibe/agent-core/lib/port-allocator';
import { publishRunnerEvent } from '@sentryvibe/agent-core/lib/runner/event-stream';
import { appendRunnerLog, markRunnerLogExit } from '@sentryvibe/agent-core/lib/runner/log-store';

function ensureAuthorized(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expected = process.env.RUNNER_SHARED_SECRET;

  if (!expected) {
    throw new Error('RUNNER_SHARED_SECRET is not configured');
  }

  if (!authHeader?.startsWith('Bearer ') || authHeader.slice('Bearer '.length).trim() !== expected) {
    return false;
  }
  return true;
}

export async function POST(request: Request) {
  try {
    if (!ensureAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const event = (await request.json()) as RunnerEvent;

    if (!event.projectId) {
      return NextResponse.json({ ok: true });
    }

    publishRunnerEvent(event);

    if (event.type === 'log-chunk' && typeof event.data === 'string') {
      appendRunnerLog(event.projectId, {
        type: event.stream === 'stderr' ? 'stderr' : 'stdout',
        data: event.data,
        timestamp: new Date(event.timestamp ?? Date.now()),
      });
    } else if (event.type === 'process-exited') {
      markRunnerLogExit(event.projectId, {
        code: event.exitCode,
        signal: event.signal ?? undefined,
      });
    }

    switch (event.type) {
      case 'port-detected': {
        await db.update(projects)
          .set({
            devServerStatus: 'running',
            devServerPort: event.port,
            port: event.port,
            tunnelUrl: event.tunnelUrl || null,
            lastActivityAt: new Date(),
          })
          .where(eq(projects.id, event.projectId));

        await updatePortReservationForProject(event.projectId, event.port);
        break;
      }
      case 'tunnel-created': {
        await db.update(projects)
          .set({
            tunnelUrl: event.tunnelUrl,
            lastActivityAt: new Date(),
          })
          .where(eq(projects.id, event.projectId));
        break;
      }
      case 'tunnel-closed': {
        await db.update(projects)
          .set({
            tunnelUrl: null,
            lastActivityAt: new Date(),
          })
          .where(eq(projects.id, event.projectId));
        break;
      }
      case 'process-exited': {
        // Exit code 143 = 128 + 15 = SIGTERM, 130 = 128 + 2 = SIGINT, 137 = 128 + 9 = SIGKILL
        const signalExitCodes = [130, 137, 143];
        const wasKilled = event.signal === 'SIGTERM' || event.signal === 'SIGINT' || event.signal === 'SIGKILL';
        const cleanExit = event.exitCode === 0 || signalExitCodes.includes(event.exitCode || -1);

        await db.update(projects)
          .set({
            devServerStatus: (wasKilled || cleanExit) ? 'stopped' : 'failed',
            devServerPid: null,
            devServerPort: null,
            tunnelUrl: null,
            lastActivityAt: new Date(),
          })
          .where(eq(projects.id, event.projectId));

        await releasePortForProject(event.projectId);
        break;
      }
      case 'project-metadata': {
        // Update project metadata (path, runCommand, projectType, port) from template download
        const metadata = (event as any).payload;
        if (metadata && event.projectId) {
          await db.update(projects)
            .set({
              path: metadata.path,
              projectType: metadata.projectType,
              runCommand: metadata.runCommand,
              port: metadata.port,
              lastActivityAt: new Date(),
            })
            .where(eq(projects.id, event.projectId));
        }
        break;
      }
      case 'build-completed': {
        // Mark project as completed
        // Note: runCommand should already be set by project-metadata event
        await db.update(projects)
          .set({
            status: 'completed',
            lastActivityAt: new Date(),
          })
          .where(eq(projects.id, event.projectId));
        break;
      }
      case 'build-failed':
      case 'build-stream':
        // UI stream events handled via event bus; DB already updated within build pipeline.
        break;
      case 'error': {
        await db.update(projects)
          .set({
            devServerStatus: 'failed',
            errorMessage: event.error,
            lastActivityAt: new Date(),
          })
          .where(eq(projects.id, event.projectId));
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to process runner event', error);
    return NextResponse.json({ error: 'Failed to process runner event' }, { status: 500 });
  }
}
