import { NextResponse } from 'next/server';
import type { RunnerEvent } from '@/shared/runner/messages';
import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { releasePortForProject, updatePortReservationForProject } from '@/lib/port-allocator';
import { publishRunnerEvent } from '@/lib/runner/event-stream';
import { appendRunnerLog, markRunnerLogExit } from '@/lib/runner/log-store';

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

    console.log('[runner-event]', event.type, event.commandId ?? 'no-command', event.projectId ?? 'no-project');
    if (event.type === 'build-stream' && typeof event.data === 'string') {
      console.log('[runner-event] chunk preview', event.data.slice(0, 200));
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
      case 'process-exited': {
        const cleanShutdown = event.exitCode === 0 || event.signal === 'SIGTERM' || event.signal === 'SIGINT';
        await db.update(projects)
          .set({
            devServerStatus: cleanShutdown ? 'stopped' : 'failed',
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
          console.log('[runner-event] Updating project metadata:', metadata);
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
        // Get project details to find actual path
        const project = await db.select().from(projects).where(eq(projects.id, event.projectId)).limit(1);

        if (project.length === 0) {
          console.warn('Project not found for build-completed event:', event.projectId);
          break;
        }

        const projectPath = project[0].path;
        if (!projectPath) {
          console.warn('Project has no path set:', event.projectId);
          break;
        }

        let runCommand = null;
        try {
          const { readFileSync } = await import('fs');
          const packageJsonPath = `${projectPath}/package.json`;
          const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

          // Detect run command from scripts
          // Always use 'dev' script if available (port controlled via env vars)
          if (packageJson.scripts?.dev) {
            // Determine which package manager to use
            const { existsSync } = await import('fs');
            if (existsSync(`${projectPath}/pnpm-lock.yaml`)) {
              runCommand = 'pnpm dev';
            } else if (existsSync(`${projectPath}/yarn.lock`)) {
              runCommand = 'yarn dev';
            } else if (existsSync(`${projectPath}/package-lock.json`)) {
              runCommand = 'npm run dev';
            } else {
              // Default to npm if no lock file
              runCommand = 'npm run dev';
            }
          } else if (packageJson.scripts?.start) {
            // Fallback to start if no dev script
            const { existsSync } = await import('fs');
            if (existsSync(`${projectPath}/pnpm-lock.yaml`)) {
              runCommand = 'pnpm start';
            } else if (existsSync(`${projectPath}/yarn.lock`)) {
              runCommand = 'yarn start';
            } else {
              runCommand = 'npm run start';
            }
          }
        } catch (error) {
          console.error('Failed to detect run command:', error);
        }

        // Mark project as completed and save run command
        await db.update(projects)
          .set({
            status: 'completed',
            runCommand,
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
