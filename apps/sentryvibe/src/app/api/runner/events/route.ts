import { NextResponse } from 'next/server';
import type { RunnerEvent } from '@/shared/runner/messages';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { projects } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import { publishRunnerEvent } from '@sentryvibe/agent-core/lib/runner/event-stream';
import { appendRunnerLog, markRunnerLogExit } from '@sentryvibe/agent-core/lib/runner/log-store';
import { projectEvents } from '@/lib/project-events';
import * as Sentry from '@sentry/nextjs';
// import { metrics } from '@sentry/core';
import { releasePortForProject } from '@sentryvibe/agent-core/lib/port-allocator';

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

/**
 * Emit project update event to SSE streams
 * Provides instant updates without polling
 */
function emitProjectUpdateFromData(projectId: string, projectData: typeof projects.$inferSelect) {
  try {
    projectEvents.emitProjectUpdate(projectId, projectData);
  } catch (error) {
    console.error(`Failed to emit project update for ${projectId}:`, error);
  }
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

    // Note: Sentry's automatic HTTP instrumentation already created a span for this request
    // and automatically continued the trace from the sentry-trace/baggage headers
    // We just add a child span for the event processing
    await Sentry.startSpan(
      {
        name: `api.runner.events.process.${event.type}`,
        op: 'event.process',
        attributes: {
          'event.type': event.type,
          'event.projectId': event.projectId,
          'event.commandId': event.commandId,
        },
      },
      async () => {
        publishRunnerEvent(event);
      }
    );


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
      // Port is now pre-allocated in the start route, no need for port-detected event
      case 'tunnel-created': {
        const [updated] = await db.update(projects)
          .set({
            tunnelUrl: event.tunnelUrl,
            lastActivityAt: new Date(),
          })
          .where(eq(projects.id, event.projectId))
          .returning();
        if (updated) emitProjectUpdateFromData(event.projectId, updated);
        break;
      }
      case 'tunnel-closed': {
        const [updated] = await db.update(projects)
          .set({
            tunnelUrl: null,
            lastActivityAt: new Date(),
          })
          .where(eq(projects.id, event.projectId))
          .returning();
        if (updated) emitProjectUpdateFromData(event.projectId, updated);
        break;
      }
      case 'port-conflict': {
        if (event.projectId) {
          const errorMessage = event.message || `Port ${event.port} is already in use on the runner host`;

          await releasePortForProject(event.projectId);

          const [updated] = await db.update(projects)
            .set({
              devServerStatus: 'failed',
              devServerPort: null,
              errorMessage,
              lastActivityAt: new Date(),
            })
            .where(eq(projects.id, event.projectId))
            .returning();

          if (updated) {
            emitProjectUpdateFromData(event.projectId, updated);
          }

          Sentry.metrics.count('dev_server_port_conflict', 1, {
            attributes: {
              project_id: event.projectId,
              port: (event.port ?? 'unknown').toString(),
            },
          });
        }
        break;
      }
      case 'ack': {
        // Check if this is a health check success (server is healthy)
        const message = (event as { message?: string }).message || '';
        if (message.includes('healthy') || message.includes('running')) {
          const [updated] = await db.update(projects)
            .set({
              devServerStatus: 'running',
              lastActivityAt: new Date(),
            })
            .where(eq(projects.id, event.projectId))
            .returning();
          if (updated) {
            console.log(`[events] ✅ Updated devServerStatus to 'running' for project ${event.projectId}`);
            emitProjectUpdateFromData(event.projectId, updated);
          }
        }
        break;
      }
      case 'process-exited': {
        // Exit code 143 = 128 + 15 = SIGTERM, 130 = 128 + 2 = SIGINT, 137 = 128 + 9 = SIGKILL
        const signalExitCodes = [130, 137, 143];
        const wasKilled = event.signal === 'SIGTERM' || event.signal === 'SIGINT' || event.signal === 'SIGKILL';
        const cleanExit = event.exitCode === 0 || signalExitCodes.includes(event.exitCode || -1);

        const [updated] = await db.update(projects)
          .set({
            devServerStatus: (wasKilled || cleanExit) ? 'stopped' : 'failed',
            devServerPid: null,
            devServerPort: null,
            tunnelUrl: null,
            lastActivityAt: new Date(),
          })
          .where(eq(projects.id, event.projectId))
          .returning();
        // No port reservation cleanup needed
        if (updated) emitProjectUpdateFromData(event.projectId, updated);
        break;
      }
      case 'project-metadata': {
        // Update project metadata (path, runCommand, projectType, port) from template download
        const metadata = 'payload' in event ? event.payload : null;
        if (metadata && event.projectId) {
          // Extract detected framework early if available
          const detectedFramework = metadata.detectedFramework || null;

          if (detectedFramework) {
            console.log(`[events] 🔍 Early framework detection for project ${event.projectId}: ${detectedFramework}`);
          }

          const [updated] = await db.update(projects)
            .set({
              path: metadata.path,
              projectType: metadata.projectType,
              runCommand: metadata.runCommand,
              port: metadata.port,
              detectedFramework, // Save detected framework early
              lastActivityAt: new Date(),
            })
            .where(eq(projects.id, event.projectId))
            .returning();
          if (updated) emitProjectUpdateFromData(event.projectId, updated);
        }
        break;
      }
      case 'build-completed': {
        // Mark project as completed
        // Note: runCommand should already be set by project-metadata event
        
        // Extract detected framework from payload if available
        const detectedFramework = ('payload' in event && event.payload && typeof event.payload === 'object' && 'detectedFramework' in event.payload) ? (event.payload as { detectedFramework?: string }).detectedFramework || null : null;
        
        if (detectedFramework) {
          console.log(`[events] 🔍 Saving detected framework for project ${event.projectId}: ${detectedFramework}`);
        }
        
        const [updated] = await db.update(projects)
          .set({
            status: 'completed',
            detectedFramework, // Save detected framework
            lastActivityAt: new Date(),
          })
          .where(eq(projects.id, event.projectId))
          .returning();
        
        if (updated) {
          emitProjectUpdateFromData(event.projectId, updated);
          
          // Track project completion with key tags
          const completionAttributes: Record<string, string> = {
            project_id: updated.id,
          };
          
          // Extract the 4 key tags from the project
          if (updated.tags && Array.isArray(updated.tags)) {
            updated.tags.forEach((tag: unknown) => {
              if (tag && typeof tag === 'object' && 'key' in tag && 'value' in tag) {
                const tagKey = tag.key as string;
                const tagValue = tag.value as string;
                if (tagKey === 'model' || tagKey === 'framework' || tagKey === 'runner' || tagKey === 'brand') {
                  completionAttributes[tagKey] = tagValue;
                }
              }
            });
          }
          // completionAttributes: { project_id: '123', model: 'claude-sonnet-4-5', framework: 'next', brand: 'sentry' }
          Sentry.metrics.count('project.completed', 1, {
            attributes: completionAttributes  
          });
        }
        break;
      }
      case 'build-failed':
      case 'build-stream':
        break;
      case 'error': {
        const [updated] = await db.update(projects)
          .set({
            devServerStatus: 'failed',
            errorMessage: event.error,
            lastActivityAt: new Date(),
          })
          .where(eq(projects.id, event.projectId))
          .returning();
        if (updated) emitProjectUpdateFromData(event.projectId, updated);
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
