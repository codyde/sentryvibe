/**
 * HTTP endpoint for persisting build events from the runner.
 *
 * SIMPLIFIED: Only persists meaningful events:
 * - Build start/complete (session status)
 * - Todo updates (via TodoWrite tool)
 * - Tool call start/complete
 *
 * Skipped events (handled via WebSocket for real-time UI only):
 * - text-delta (streaming text)
 * - reasoning (Claude's thinking)
 * - message content
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import {
  generationSessions,
  generationTodos,
  generationToolCalls,
} from '@sentryvibe/agent-core/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { buildWebSocketServer } from '@sentryvibe/agent-core/lib/websocket/server';
import * as Sentry from '@sentry/nextjs';

const SHARED_SECRET = process.env.RUNNER_SHARED_SECRET;

function ensureAuthorized(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  if (!SHARED_SECRET || !authHeader || authHeader !== `Bearer ${SHARED_SECRET}`) {
    return false;
  }
  return true;
}

interface BuildEventPayload {
  commandId: string;
  sessionId: string;
  projectId: string;
  buildId: string;
  agentId: string;
  claudeModelId?: string;
  event: {
    type: string;
    messageId?: string;
    toolCallId?: string;
    toolName?: string;
    todoIndex?: number;
    todo_index?: number;
    input?: { todos?: Array<{ content?: string; activeForm?: string; status?: string }> };
    output?: unknown;
    id?: string;
    delta?: string;
    message?: string;
    data?: { message?: string };
  };
}

// Track active todo index per session
declare global {
  // eslint-disable-next-line no-var
  var __httpActiveTodoIndexes: Map<string, number> | undefined;
}
const activeTodoIndexes = global.__httpActiveTodoIndexes ?? new Map();
global.__httpActiveTodoIndexes = activeTodoIndexes;

// Track finalized sessions to prevent duplicate operations
declare global {
  // eslint-disable-next-line no-var
  var __httpFinalizedSessions: Set<string> | undefined;
}
const finalizedSessions = global.__httpFinalizedSessions ?? new Set();
global.__httpFinalizedSessions = finalizedSessions;

// Track previous todo count per session to avoid unnecessary pruning queries
declare global {
  // eslint-disable-next-line no-var
  var __httpPreviousTodoCounts: Map<string, number> | undefined;
}
const previousTodoCounts = global.__httpPreviousTodoCounts ?? new Map();
global.__httpPreviousTodoCounts = previousTodoCounts;

// Track started sessions to avoid duplicate start event processing
declare global {
  // eslint-disable-next-line no-var
  var __httpStartedSessions: Set<string> | undefined;
}
const startedSessions = global.__httpStartedSessions ?? new Set();
global.__httpStartedSessions = startedSessions;

export async function POST(request: Request) {
  if (!ensureAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as BuildEventPayload;
    const { commandId, projectId, buildId, event } = payload;
    let { sessionId } = payload;

    if (!projectId || !event?.type) {
      return NextResponse.json({ error: 'Missing required fields: projectId and event.type' }, { status: 400 });
    }

    // If sessionId not provided, look it up from buildId or commandId
    if (!sessionId && (buildId || commandId)) {
      const lookupId = buildId || `build-${commandId}`;
      const sessions = await db.select()
        .from(generationSessions)
        .where(eq(generationSessions.buildId, lookupId))
        .limit(1);

      if (sessions.length > 0) {
        sessionId = sessions[0].id;
      } else {
        // Try alternative lookup by projectId and recent session
        const recentSessions = await db.select()
          .from(generationSessions)
          .where(eq(generationSessions.projectId, projectId))
          .orderBy(sql`${generationSessions.createdAt} DESC`)
          .limit(1);

        if (recentSessions.length > 0) {
          sessionId = recentSessions[0].id;
        }
      }
    }

    if (!sessionId) {
      console.warn(`[build-events] No session found for buildId=${buildId}, commandId=${commandId}, projectId=${projectId}`);
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const timestamp = new Date();

    // Process based on event type - ONLY persist meaningful events
    switch (event.type) {
      case 'start': {
        console.log(`[build-events] 🚀 start event received (sessionId=${sessionId}, projectId=${projectId})`);

        // Skip duplicate start events for the same session
        if (startedSessions.has(sessionId)) {
          console.log(`[build-events] ⏭️ Skipping duplicate start event for session ${sessionId}`);
          break;
        }

        // Mark session as started
        startedSessions.add(sessionId);

        // DB: Update session status to active
        await db.update(generationSessions)
          .set({ status: 'active', updatedAt: timestamp })
          .where(eq(generationSessions.id, sessionId));

        // WebSocket: Broadcast build started
        console.log(`[build-events] 📡 Broadcasting build-started (projectId=${projectId}, sessionId=${sessionId})`);
        buildWebSocketServer.broadcastBuildStarted(projectId, sessionId, buildId);
        break;
      }

      case 'tool-input-available': {
        const toolCallId = event.toolCallId ?? randomUUID();
        const todoIndex = event.todoIndex ?? event.todo_index ?? activeTodoIndexes.get(sessionId) ?? -1;

        if (event.toolName === 'TodoWrite') {
          // DB: Also insert TodoWrite as a tool call (for output-available to find)
          await db.insert(generationToolCalls).values({
            sessionId,
            todoIndex,
            toolCallId,
            name: 'TodoWrite',
            input: event.input ?? null,
            state: 'input-available',
            startedAt: timestamp,
            createdAt: timestamp,
            updatedAt: timestamp,
          }).onConflictDoUpdate({
            target: [generationToolCalls.sessionId, generationToolCalls.toolCallId],
            set: { input: event.input ?? null, state: 'input-available', updatedAt: timestamp },
          });

          // DB: Upsert todos
          const todos = Array.isArray(event.input?.todos) ? event.input.todos : [];
          const prevCount = previousTodoCounts.get(sessionId) ?? 0;

          if (todos.length > 0) {
            const todoValues = todos.map((todo, index) => ({
              sessionId,
              todoIndex: index,
              content: todo?.content ?? todo?.activeForm ?? 'Untitled task',
              activeForm: todo?.activeForm ?? null,
              status: todo?.status ?? 'pending',
              createdAt: timestamp,
              updatedAt: timestamp,
            }));

            await db.insert(generationTodos)
              .values(todoValues)
              .onConflictDoUpdate({
                target: [generationTodos.sessionId, generationTodos.todoIndex],
                set: {
                  content: sql`excluded.content`,
                  activeForm: sql`excluded.active_form`,
                  status: sql`excluded.status`,
                  updatedAt: sql`excluded.updated_at`,
                },
              });
          }

          // Prune if todo count decreased
          if (todos.length < prevCount) {
            await db.delete(generationToolCalls)
              .where(and(
                eq(generationToolCalls.sessionId, sessionId),
                sql`${generationToolCalls.todoIndex} >= ${todos.length}`,
              ));
            await db.delete(generationTodos)
              .where(and(
                eq(generationTodos.sessionId, sessionId),
                sql`${generationTodos.todoIndex} >= ${todos.length}`,
              ));
          }

          // Update tracking
          previousTodoCounts.set(sessionId, todos.length);
          const activeIndex = todos.findIndex(t => t.status === 'in_progress');
          activeTodoIndexes.set(sessionId, activeIndex);

          // WebSocket: Broadcast todos update
          buildWebSocketServer.broadcastTodosUpdate(
            projectId,
            sessionId,
            todos.map(t => ({
              content: t.content ?? t.activeForm ?? 'Untitled task',
              status: t.status ?? 'pending',
              activeForm: t.activeForm,
            })),
            activeIndex
          );

          // Auto-finalize if all todos complete
          // NOTE: Don't broadcast build-complete here - the runner will send build-completed
          // event with the summary, and persistent-event-processor will broadcast it
          const allComplete = todos.length > 0 && todos.every(t => t.status === 'completed');
          if (allComplete && !finalizedSessions.has(sessionId)) {
            finalizedSessions.add(sessionId);
            await db.update(generationSessions)
              .set({ status: 'completed', endedAt: timestamp, updatedAt: timestamp })
              .where(eq(generationSessions.id, sessionId));
            // Don't broadcast here - let persistent-event-processor handle it with summary
            console.log(`[build-events] ✅ Session ${sessionId} marked complete in DB (waiting for runner summary)`);
          }
        }

        // DB: Insert tool call record (skip TodoWrite - handled above)
        if (event.toolName && event.toolName !== 'TodoWrite') {
          console.log(`[build-events] 🔧 tool-input-available: ${event.toolName} (todoIndex=${todoIndex}, sessionId=${sessionId})`);

          await db.insert(generationToolCalls).values({
            sessionId,
            todoIndex,
            toolCallId,
            name: event.toolName,
            input: event.input ?? null,
            state: 'input-available',
            startedAt: timestamp,
            createdAt: timestamp,
            updatedAt: timestamp,
          }).onConflictDoUpdate({
            target: [generationToolCalls.sessionId, generationToolCalls.toolCallId],
            set: { input: event.input ?? null, state: 'input-available', updatedAt: timestamp },
          });

          // WebSocket: Broadcast tool-input-available ONLY for planning phase tools
          // This enables the shimmer animation to show the active tool being used
          // Execution phase tools (todoIndex >= 0) only broadcast on completion
          if (todoIndex < 0) {
            console.log(`[build-events] 📡 Broadcasting planning tool: ${event.toolName} (todoIndex=${todoIndex})`);
            buildWebSocketServer.broadcastToolCall(projectId, sessionId, {
              id: toolCallId,
              name: event.toolName,
              todoIndex,
              input: event.input ?? undefined,
              state: 'input-available',
            });
          }
        }
        break;
      }

      case 'tool-output-available': {
        const toolCallId = event.toolCallId ?? '';
        const todoIndex = event.todoIndex ?? event.todo_index ?? activeTodoIndexes.get(sessionId) ?? -1;

        // DB: Fetch existing tool call to get input data
        const existingTools = await db.select()
          .from(generationToolCalls)
          .where(and(
            eq(generationToolCalls.sessionId, sessionId),
            eq(generationToolCalls.toolCallId, toolCallId),
          ))
          .limit(1);

        const existingTool = existingTools[0];

        if (!existingTool) {
          // Tool not found - input event never arrived or had different ID
          // Don't broadcast if we don't have the input data
          break;
        }

        // DB: Update tool call with output
        await db.update(generationToolCalls)
          .set({
            output: event.output ?? null,
            state: 'output-available',
            endedAt: timestamp,
            updatedAt: timestamp,
          })
          .where(and(
            eq(generationToolCalls.sessionId, sessionId),
            eq(generationToolCalls.toolCallId, toolCallId),
          ));

        // WebSocket: Broadcast tool completion WITH COMPLETE DATA
        // Broadcast ALL tools including planning phase (todoIndex < 0)
        // Frontend handles planning tools separately via planningTools array
        if (event.toolName) {
          buildWebSocketServer.broadcastToolCall(projectId, sessionId, {
            id: toolCallId,
            name: event.toolName,
            todoIndex,
            input: existingTool?.input ?? undefined, // Include input for UI details (file paths, etc.)
            output: event.output, // Include output for frontend
            state: 'output-available',
          });
        }
        break;
      }

      case 'tool-error': {
        const toolCallId = event.toolCallId ?? '';
        const todoIndex = event.todoIndex ?? event.todo_index ?? activeTodoIndexes.get(sessionId) ?? -1;

        // DB: Fetch existing tool call to get input data
        const existingErrorTools = await db.select()
          .from(generationToolCalls)
          .where(and(
            eq(generationToolCalls.sessionId, sessionId),
            eq(generationToolCalls.toolCallId, toolCallId),
          ))
          .limit(1);

        const existingErrorTool = existingErrorTools[0];

        if (!existingErrorTool) {
          // Tool not found - don't broadcast
          break;
        }

        // DB: Update tool call with error
        await db.update(generationToolCalls)
          .set({
            output: event.error ?? event.output ?? null,
            state: 'error',
            endedAt: timestamp,
            updatedAt: timestamp,
          })
          .where(and(
            eq(generationToolCalls.sessionId, sessionId),
            eq(generationToolCalls.toolCallId, toolCallId),
          ));

        // WebSocket: Broadcast tool error WITH COMPLETE DATA
        // Broadcast ALL tools including planning phase (todoIndex < 0)
        if (event.toolName) {
          buildWebSocketServer.broadcastToolCall(projectId, sessionId, {
            id: toolCallId,
            name: event.toolName,
            todoIndex,
            input: existingErrorTool?.input ?? undefined, // Include input for UI details
            output: event.error ?? event.output, // Include error for frontend
            state: 'error',
          });
        }
        break;
      }

      // SKIPPED EVENTS - no DB writes, just acknowledge
      case 'text-delta':
      case 'data-reasoning':
      case 'reasoning':
      case 'finish':
        // These events are handled via WebSocket for real-time UI
        // No database persistence needed
        break;

      default:
        // No-op for unknown event types
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[build-events] Error processing event:', error);
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Failed to process event' }, { status: 500 });
  }
}
