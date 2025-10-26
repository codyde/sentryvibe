import { randomUUID } from 'crypto';
import type { RunnerEvent } from '../../shared/runner/messages';
import { addRunnerEventSubscriber } from './event-stream';
import { db } from '../db/client';
import {
  generationSessions,
  generationTodos,
  generationToolCalls,
  generationNotes,
  projects,
} from '../db/schema';
import { eq, and } from 'drizzle-orm';
import type { TodoItem, ToolCall, GenerationState, TextMessage } from '../types/generation';
import { serializeGenerationState } from '../generation-persistence';

interface ActiveBuildContext {
  commandId: string;
  sessionId: string;
  projectId: string;
  buildId: string;
  unsubscribe: () => void;
  toolCallNameMap: Map<string, string>;
  currentActiveTodoIndex: number;
  startedAt: Date;
}

// Global registry of active builds
declare global {
  // eslint-disable-next-line no-var
  var __activeBuilds: Map<string, ActiveBuildContext> | undefined;
}

const activeBuilds = global.__activeBuilds ?? new Map<string, ActiveBuildContext>();
global.__activeBuilds = activeBuilds;

async function retryOnTimeout<T>(fn: () => Promise<T>, retries = 5): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const err = error as { code?: string; errno?: number; message?: string };
      const isTimeout = err?.code === 'ETIMEDOUT' || err?.errno === -60 || err?.message?.includes('timeout');
      const isLastAttempt = attempt === retries;

      if (isTimeout && !isLastAttempt) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        console.warn(`[persistent-processor] DB timeout on attempt ${attempt + 1}/${retries}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!isTimeout || isLastAttempt) {
        console.error(`[persistent-processor] DB operation failed after ${attempt + 1} attempts:`, err?.message || error);
        throw error;
      }
    }
  }
  return null;
}

async function buildSnapshot(context: ActiveBuildContext): Promise<GenerationState> {
  const [sessionRow] = await db
    .select()
    .from(generationSessions)
    .where(eq(generationSessions.id, context.sessionId))
    .limit(1);

  if (!sessionRow) {
    throw new Error('Generation session not found when building snapshot');
  }

  const todoRows = await db
    .select()
    .from(generationTodos)
    .where(eq(generationTodos.sessionId, context.sessionId))
    .orderBy(generationTodos.todoIndex);

  const toolRows = await db
    .select()
    .from(generationToolCalls)
    .where(eq(generationToolCalls.sessionId, context.sessionId));

  const noteRows = await db
    .select()
    .from(generationNotes)
    .where(eq(generationNotes.sessionId, context.sessionId))
    .orderBy(generationNotes.createdAt);

  const todosSnapshot: TodoItem[] = todoRows.map(row => ({
    content: row.content,
    status: (row.status as TodoItem['status']) ?? 'pending',
    activeForm: row.activeForm ?? row.content,
  }));

  const toolsByTodo: Record<number, ToolCall[]> = {};
  toolRows.forEach(tool => {
    const index = tool.todoIndex ?? -1;
    if (index < 0) return;
    if (!toolsByTodo[index]) {
      toolsByTodo[index] = [];
    }
    toolsByTodo[index].push({
      id: tool.toolCallId ?? tool.id,
      name: tool.name,
      input: tool.input ?? undefined,
      output: tool.output ?? undefined,
      state: tool.state as ToolCall['state'],
      startTime: tool.startedAt ?? sessionRow.startedAt ?? new Date(),
      endTime: tool.endedAt ?? undefined,
    });
  });

  const textByTodo: Record<number, TextMessage[]> = {};
  noteRows.forEach(note => {
    const index = note.todoIndex ?? -1;
    if (index < 0) return;
    if (!textByTodo[index]) {
      textByTodo[index] = [];
    }
    textByTodo[index].push({
      id: note.textId ?? note.id,
      text: note.content,
      timestamp: note.createdAt ?? new Date(),
    });
  });

  const activeIndex = todoRows.findIndex(row => row.status === 'in_progress');

  let persistedState: Record<string, unknown> | null = null;
  if (sessionRow.rawState) {
    if (typeof sessionRow.rawState === 'string') {
      try {
        persistedState = JSON.parse(sessionRow.rawState) as Record<string, unknown>;
      } catch (parseError) {
        console.warn('[persistent-processor] Failed to parse rawState JSON:', parseError);
      }
    } else {
      persistedState = sessionRow.rawState as Record<string, unknown>;
    }
  }

  const snapshot: GenerationState = {
    id: sessionRow.buildId,
    projectId: sessionRow.projectId,
    projectName: '', // Will be filled in by caller if needed
    operationType: (sessionRow.operationType ?? 'continuation') as GenerationState['operationType'],
    agentId: (persistedState?.agentId as GenerationState['agentId']) ?? 'claude-code',
    claudeModelId: persistedState?.claudeModelId as GenerationState['claudeModelId'],
    todos: todosSnapshot,
    toolsByTodo,
    textByTodo,
    activeTodoIndex: activeIndex,
    isActive: sessionRow.status === 'active',
    startTime: sessionRow.startedAt ?? context.startedAt,
    endTime: sessionRow.endedAt ?? undefined,
    codex: persistedState?.codex as GenerationState['codex'],
  };

  return snapshot;
}

async function refreshRawState(context: ActiveBuildContext) {
  try {
    const snapshot = await buildSnapshot(context);
    const serialized = serializeGenerationState(snapshot);
    await db.update(generationSessions)
      .set({ rawState: serialized, updatedAt: new Date() })
      .where(eq(generationSessions.id, context.sessionId));
  } catch (snapshotError) {
    console.warn('[persistent-processor] Failed to refresh raw generation state:', snapshotError);
  }
}

async function finalizeSession(context: ActiveBuildContext, status: 'completed' | 'failed', timestamp: Date) {
  await retryOnTimeout(() =>
    db.update(generationSessions)
      .set({ status, endedAt: timestamp, updatedAt: timestamp })
      .where(eq(generationSessions.id, context.sessionId))
  );
  await refreshRawState(context);

  // Update project status
  if (status === 'completed') {
    try {
      await db.update(projects)
        .set({ status: 'completed', updatedAt: timestamp })
        .where(eq(projects.id, context.projectId));
      console.log('[persistent-processor] ✅ Updated project status to completed');
    } catch (error) {
      console.error('[persistent-processor] Failed to update project status:', error);
    }
  }
}

async function persistTodo(
  context: ActiveBuildContext,
  todo: { content?: string; activeForm?: string; status?: string },
  index: number
) {
  const content = todo?.content ?? todo?.activeForm ?? 'Untitled task';
  const activeForm = todo?.activeForm ?? null;
  const status = todo?.status ?? 'pending';
  const timestamp = new Date();

  await retryOnTimeout(() =>
    db.insert(generationTodos).values({
      sessionId: context.sessionId,
      todoIndex: index,
      content,
      activeForm,
      status,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).onConflictDoUpdate({
      target: [generationTodos.sessionId, generationTodos.todoIndex],
      set: {
        content,
        activeForm,
        status,
        updatedAt: timestamp,
      },
    })
  );
}

async function persistToolCall(
  context: ActiveBuildContext,
  eventData: {
    toolCallId?: string;
    id?: string;
    toolName?: string;
    todoIndex?: number;
    todo_index?: number;
    input?: unknown;
    output?: unknown;
  },
  state: 'input-available' | 'output-available'
) {
  const toolCallId = eventData.toolCallId ?? eventData.id ?? randomUUID();
  const todoIndex = typeof eventData.todoIndex === 'number'
    ? eventData.todoIndex
    : typeof eventData.todo_index === 'number'
      ? eventData.todo_index
      : -1;

  const timestamp = new Date();

  // If toolName is missing and this is an output event, try to find the existing record
  if (!eventData.toolName && state === 'output-available') {
    const existing = await retryOnTimeout(() =>
      db.select()
        .from(generationToolCalls)
        .where(and(
          eq(generationToolCalls.sessionId, context.sessionId),
          eq(generationToolCalls.toolCallId, toolCallId),
        ))
        .limit(1)
    );

    if (existing && existing.length > 0) {
      // Update existing record
      await retryOnTimeout(() =>
        db.update(generationToolCalls)
          .set({
            output: eventData.output ?? null,
            state,
            endedAt: timestamp,
            updatedAt: timestamp,
          })
          .where(eq(generationToolCalls.id, existing[0].id))
      );
      return;
    }
    // If no existing record and no toolName, we can't insert - skip it
    return;
  }

  // Ensure toolName exists for insert
  if (!eventData.toolName) {
    return;
  }

  const toolName = eventData.toolName;

  await retryOnTimeout(() =>
    db.insert(generationToolCalls).values({
      sessionId: context.sessionId,
      todoIndex,
      toolCallId,
      name: toolName,
      input: state === 'input-available' ? eventData.input ?? null : undefined,
      output: state === 'output-available' ? eventData.output ?? null : undefined,
      state,
      startedAt: timestamp,
      endedAt: state === 'output-available' ? timestamp : null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).onConflictDoUpdate({
      target: [generationToolCalls.sessionId, generationToolCalls.toolCallId],
      set: {
        input: state === 'input-available' ? eventData.input ?? null : generationToolCalls.input,
        output: state === 'output-available' ? eventData.output ?? null : generationToolCalls.output,
        state,
        endedAt: state === 'output-available' ? timestamp : generationToolCalls.endedAt,
        updatedAt: timestamp,
      },
    })
  );
}

async function appendNote(
  context: ActiveBuildContext,
  params: { textId?: string; content: string; kind: string; todoIndex: number }
) {
  const { textId, content, kind, todoIndex } = params;
  if (!content) return;
  const timestamp = new Date();

  if (textId) {
    const existing = await retryOnTimeout(() =>
      db
        .select()
        .from(generationNotes)
        .where(and(
          eq(generationNotes.sessionId, context.sessionId),
          eq(generationNotes.textId, textId),
        ))
        .limit(1)
    );

    if (existing && existing.length > 0) {
      await retryOnTimeout(() =>
        db.update(generationNotes)
          .set({
            content: existing[0].content + content,
          })
          .where(eq(generationNotes.id, existing[0].id))
      );
      return;
    }
  }

  await retryOnTimeout(() =>
    db.insert(generationNotes).values({
      sessionId: context.sessionId,
      todoIndex,
      textId: textId ?? null,
      kind,
      content,
      createdAt: timestamp,
    })
  );
}

async function persistEvent(
  context: ActiveBuildContext,
  eventData: {
    type?: string;
    toolCallId?: string;
    toolName?: string;
    todoIndex?: number;
    input?: { todos?: Array<{ content?: string; activeForm?: string; status?: string }> };
    output?: unknown;
    id?: string;
    delta?: string;
    message?: string;
    data?: { message?: string };
  }
) {
  if (!eventData || !context.sessionId) return;
  const timestamp = new Date();

  switch (eventData.type) {
    case 'start':
      await retryOnTimeout(() =>
        db.update(generationSessions)
          .set({
            status: 'active',
            updatedAt: timestamp,
          })
          .where(eq(generationSessions.id, context.sessionId))
      );
      await refreshRawState(context);
      break;

    case 'tool-input-available':
      // Store toolName in map for later output events
      if (eventData.toolCallId && eventData.toolName) {
        context.toolCallNameMap.set(eventData.toolCallId, eventData.toolName);
      }

      if (eventData.toolName === 'TodoWrite') {
        const todos = Array.isArray(eventData.input?.todos) ? eventData.input.todos : [];

        // CRITICAL: Wait for ALL todos to be persisted BEFORE continuing
        await Promise.all(todos.map((todo, index: number) => persistTodo(context, todo, index)));

        // Update active todo index for subsequent events
        context.currentActiveTodoIndex = todos.findIndex((t) => t.status === 'in_progress');
        console.log(`[persistent-processor] Updated activeTodoIndex to ${context.currentActiveTodoIndex}`);

        // Persist TodoWrite as a tool call
        await persistToolCall(context, eventData, 'input-available');

        // CRITICAL: Refresh state NOW to ensure frontend has todos before tools arrive
        await refreshRawState(context);
        console.log(`[persistent-processor] ✅ Todos persisted and state refreshed, activeTodoIndex=${context.currentActiveTodoIndex}`);

        // Don't call refreshRawState again at the end - we already did it
        return;
      } else if (eventData.toolName) {
        // Inject active todo index into tool event before persisting
        if (!eventData.todoIndex && context.currentActiveTodoIndex >= 0) {
          eventData.todoIndex = context.currentActiveTodoIndex;
          console.log(`[persistent-processor] Injected todoIndex ${context.currentActiveTodoIndex} into ${eventData.toolName} tool`);
        }
        await persistToolCall(context, eventData, 'input-available');
      }

      // Only refresh if we didn't already refresh for TodoWrite
      if (eventData.toolName !== 'TodoWrite') {
        await refreshRawState(context);
      }
      break;

    case 'tool-output-available':
      // Try to restore toolName from map if missing
      if (!eventData.toolName && eventData.toolCallId) {
        const storedToolName = context.toolCallNameMap.get(eventData.toolCallId);
        if (storedToolName) {
          eventData.toolName = storedToolName;
        }
      }
      await persistToolCall(context, eventData, 'output-available');
      await refreshRawState(context);
      break;

    case 'text-delta':
      // Inject active todo index if not present
      const textTodoIndex = typeof eventData.todoIndex === 'number'
        ? eventData.todoIndex
        : context.currentActiveTodoIndex;
      await appendNote(context, {
        textId: eventData.id,
        content: eventData.delta ?? '',
        kind: 'text',
        todoIndex: textTodoIndex,
      });
      await refreshRawState(context);
      break;

    case 'data-reasoning':
    case 'reasoning':
      if (eventData.message || eventData.data?.message) {
        // Inject active todo index if not present
        const reasoningTodoIndex = typeof eventData.todoIndex === 'number'
          ? eventData.todoIndex
          : context.currentActiveTodoIndex;
        await appendNote(context, {
          textId: eventData.id ?? undefined,
          content: eventData.message ?? eventData.data?.message ?? '',
          kind: 'reasoning',
          todoIndex: reasoningTodoIndex,
        });
        await refreshRawState(context);
      }
      break;

    case 'finish':
      await finalizeSession(context, 'completed', timestamp);
      // Clean up this build from active registry
      cleanupBuild(context.commandId);
      break;

    case 'error':
      await finalizeSession(context, 'failed', timestamp);
      // Clean up this build from active registry
      cleanupBuild(context.commandId);
      break;

    default:
      break;
  }
}

function cleanupBuild(commandId: string) {
  const context = activeBuilds.get(commandId);
  if (context) {
    console.log(`[persistent-processor] 🧹 Cleaning up build ${commandId}`);
    context.unsubscribe();
    activeBuilds.delete(commandId);
  }
}

/**
 * Register a build to be tracked persistently.
 * Database updates will continue even if HTTP connections are lost.
 *
 * @param commandId - Unique identifier for this build command
 * @param sessionId - Database session ID
 * @param projectId - Project ID
 * @param buildId - Build ID
 * @returns Cleanup function to manually stop tracking (optional - will auto-cleanup on finish/error)
 */
export function registerBuild(
  commandId: string,
  sessionId: string,
  projectId: string,
  buildId: string
): () => void {
  // Check if already registered
  if (activeBuilds.has(commandId)) {
    console.warn(`[persistent-processor] Build ${commandId} already registered`);
    return () => cleanupBuild(commandId);
  }

  console.log(`[persistent-processor] 📝 Registering build ${commandId} for persistent tracking`);

  const context: ActiveBuildContext = {
    commandId,
    sessionId,
    projectId,
    buildId,
    unsubscribe: () => {},
    toolCallNameMap: new Map(),
    currentActiveTodoIndex: -1,
    startedAt: new Date(),
  };

  // Subscribe to runner events - this subscription persists across HTTP disconnections
  const unsubscribe = addRunnerEventSubscriber(commandId, async (event: RunnerEvent) => {
    try {
      // Handle different event types
      if (event.type === 'build-stream' && typeof event.data === 'string') {
        // Parse SSE data
        const match = event.data.match(/data:\s*({.*})/);
        if (match) {
          const eventData = JSON.parse(match[1]);
          await persistEvent(context, eventData);
        }
      } else if (event.type === 'build-completed') {
        await finalizeSession(context, 'completed', new Date());
        cleanupBuild(commandId);
      } else if (event.type === 'build-failed' || event.type === 'error') {
        await finalizeSession(context, 'failed', new Date());
        cleanupBuild(commandId);
      }
    } catch (error) {
      console.error('[persistent-processor] Error processing event:', error);
      // Don't let errors stop the processor - keep going
    }
  });

  context.unsubscribe = unsubscribe;
  activeBuilds.set(commandId, context);

  // Return cleanup function
  return () => cleanupBuild(commandId);
}

/**
 * Check if a build is currently being tracked
 */
export function isBuildActive(commandId: string): boolean {
  return activeBuilds.has(commandId);
}

/**
 * Get all active build IDs (for debugging/monitoring)
 */
export function getActiveBuilds(): string[] {
  return Array.from(activeBuilds.keys());
}

/**
 * Clean up stuck builds (builds that haven't received events in a while)
 * This should be called periodically by a cron job or similar mechanism
 */
export async function cleanupStuckBuilds(maxAgeMinutes = 30) {
  const now = Date.now();
  const maxAge = maxAgeMinutes * 60 * 1000;

  console.log(`[persistent-processor] 🔍 Checking for stuck builds (older than ${maxAgeMinutes} minutes)`);

  for (const [commandId, context] of activeBuilds.entries()) {
    const age = now - context.startedAt.getTime();
    if (age > maxAge) {
      console.log(`[persistent-processor] Found stuck build ${commandId}, age: ${Math.round(age / 1000 / 60)} minutes`);

      // Check database to see if build is actually complete
      try {
        const [session] = await db
          .select()
          .from(generationSessions)
          .where(eq(generationSessions.id, context.sessionId))
          .limit(1);

        if (session) {
          // If session is still marked active but hasn't been updated recently, finalize it
          const lastUpdate = session.updatedAt ? new Date(session.updatedAt).getTime() : context.startedAt.getTime();
          const timeSinceUpdate = now - lastUpdate;

          if (session.status === 'active' && timeSinceUpdate > maxAge) {
            console.log(`[persistent-processor] Finalizing stuck session ${context.sessionId}`);

            // Check if all todos are complete
            const todos = await db
              .select()
              .from(generationTodos)
              .where(eq(generationTodos.sessionId, context.sessionId));

            const allComplete = todos.length > 0 && todos.every(t => t.status === 'completed');
            const status = allComplete ? 'completed' : 'failed';

            await finalizeSession(context, status, new Date());
          }
        }
      } catch (error) {
        console.error(`[persistent-processor] Error checking stuck build ${commandId}:`, error);
      }

      // Clean up regardless
      cleanupBuild(commandId);
    }
  }
}
