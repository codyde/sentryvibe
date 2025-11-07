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
  messages,
} from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import type { TodoItem, ToolCall, GenerationState, TextMessage } from '../../types/generation';
import { serializeGenerationState } from '../generation-persistence';
import { buildWebSocketServer } from '../../index';
import * as Sentry from '@sentry/node';

interface ActiveBuildContext {
  commandId: string;
  sessionId: string;
  projectId: string;
  buildId: string;
  agentId: string;
  claudeModelId?: string;
  unsubscribe: () => void;
  toolCallNameMap: Map<string, string>;
  currentActiveTodoIndex: number;
  startedAt: Date;
  currentMessageId: string | null;
  messageBuffers: Map<string, MessageBuffer>;
  stateVersion: number;
  refreshPromise: Promise<void> | null; // Mutex to serialize refreshRawState calls
}

type MessagePart = {
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  state?: string;
};

interface MessageBuffer {
  rowId: string;
  parts: MessagePart[];
}

async function pruneTodoTail(context: ActiveBuildContext, keepCount: number) {
  // Remove tool calls tied to trimmed todos
  await retryOnTimeout(() =>
    db.delete(generationToolCalls)
      .where(and(
        eq(generationToolCalls.sessionId, context.sessionId),
        sql`${generationToolCalls.todoIndex} >= ${keepCount}`,
      ))
  );

  // Remove notes linked to trimmed todos
  await retryOnTimeout(() =>
    db.delete(generationNotes)
      .where(and(
        eq(generationNotes.sessionId, context.sessionId),
        sql`${generationNotes.todoIndex} >= ${keepCount}`,
      ))
  );

  // Remove the extra todos themselves
  await retryOnTimeout(() =>
    db.delete(generationTodos)
      .where(and(
        eq(generationTodos.sessionId, context.sessionId),
        sql`${generationTodos.todoIndex} >= ${keepCount}`,
      ))
  );
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
  
  // Parallelize independent database queries to reduce latency and connection churn
  // Fixes N+1 query issue: https://buildwithcode.sentry.io/issues/6977830586/
  const [projectRow, todoRows, toolRows, noteRows] = await Promise.all([
    // Fetch project name from database
    db
      .select()
      .from(projects)
      .where(eq(projects.id, sessionRow.projectId))
      .limit(1)
      .then(rows => rows[0]),
    
    // Fetch todos
    db
      .select()
      .from(generationTodos)
      .where(eq(generationTodos.sessionId, context.sessionId))
      .orderBy(generationTodos.todoIndex),
    
    // Fetch tool calls
    db
      .select()
      .from(generationToolCalls)
      .where(eq(generationToolCalls.sessionId, context.sessionId)),
    
    // Fetch notes
    db
      .select()
      .from(generationNotes)
      .where(eq(generationNotes.sessionId, context.sessionId))
      .orderBy(generationNotes.createdAt),
  ]);
  
  const projectName = projectRow?.name || context.projectId;

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
    projectName: projectName,
    operationType: (sessionRow.operationType ?? 'continuation') as GenerationState['operationType'],
    agentId: (persistedState?.agentId as GenerationState['agentId']) ?? context.agentId as GenerationState['agentId'],
    claudeModelId: (persistedState?.claudeModelId as GenerationState['claudeModelId']) ?? context.claudeModelId as GenerationState['claudeModelId'],
    todos: todosSnapshot,
    toolsByTodo,
    textByTodo,
    activeTodoIndex: activeIndex,
    isActive: sessionRow.status === 'active',
    startTime: sessionRow.startedAt ?? context.startedAt,
    endTime: sessionRow.endedAt ?? undefined,
    codex: persistedState?.codex as GenerationState['codex'],
    stateVersion: context.stateVersion,
  };

  return snapshot;
}

async function refreshRawState(context: ActiveBuildContext) {
  // CRITICAL FIX: Serialize refreshRawState calls to prevent out-of-order stateVersion broadcasts
  // If a refresh is already in progress, wait for it to complete first
  if (context.refreshPromise) {
    await context.refreshPromise;
  }
  
  // Create a new promise for this refresh operation
  context.refreshPromise = (async () => {
    try {
      context.stateVersion += 1;
      const snapshot = await buildSnapshot(context);
      const serialized = serializeGenerationState(snapshot);
      await db.update(generationSessions)
        .set({ rawState: serialized, updatedAt: new Date() })
        .where(eq(generationSessions.id, context.sessionId));
      
      // Capture current trace context for distributed tracing
      const activeSpan = Sentry.getActiveSpan();
      const traceContext = activeSpan ? {
        trace: Sentry.getTraceData()['sentry-trace'],
        baggage: Sentry.getTraceData().baggage,
      } : undefined;
      
      // Quiet: Trace context captured (too noisy - happens for every tool call)
      
      // Broadcast state update via WebSocket with trace context
      buildWebSocketServer.broadcastStateUpdate(
        context.projectId,
        context.sessionId,
        snapshot,
        traceContext
      );
    } catch (snapshotError) {
      console.warn('[persistent-processor] Failed to refresh raw generation state:', snapshotError);
    } finally {
      // Clear the promise once this refresh completes
      context.refreshPromise = null;
    }
  })();
  
  // Wait for this refresh to complete
  await context.refreshPromise;
}

function serializeMessageParts(parts: MessagePart[]): string {
  if (parts.length === 0) {
    return '[]';
  }

  try {
    return JSON.stringify(parts);
  } catch (error) {
    console.error('[persistent-processor] Failed to serialize message parts, falling back to text block', error);
    return JSON.stringify([{ type: 'text', text: '[serialization-error]' }]);
  }
}

function getOrCreateMessageBuffer(context: ActiveBuildContext, messageId: string): MessageBuffer {
  let buffer = context.messageBuffers.get(messageId);
  if (!buffer) {
    buffer = {
      rowId: randomUUID(),
      parts: [],
    };
    context.messageBuffers.set(messageId, buffer);
  }
  return buffer;
}

async function persistMessageBuffer(context: ActiveBuildContext, messageId: string) {
  const buffer = context.messageBuffers.get(messageId);
  if (!buffer) return;

  const serialized = serializeMessageParts(buffer.parts);

  await retryOnTimeout(() =>
    db.insert(messages)
      .values({
        id: buffer.rowId,
        projectId: context.projectId,
        role: 'assistant',
        content: serialized,
      })
      .onConflictDoUpdate({
        target: messages.id,
        set: {
          content: serialized,
        },
      })
  );
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

  // Quiet: Tool persistence (too noisy - happens for every tool call)

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

  // Quiet: Success (too noisy)
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
    messageId?: string;
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
      {
        const messageId = typeof eventData.messageId === 'string'
          ? eventData.messageId
          : randomUUID();
        context.currentMessageId = messageId;
        const buffer = getOrCreateMessageBuffer(context, messageId);
        buffer.rowId = randomUUID();
        buffer.parts = [];
        await persistMessageBuffer(context, messageId);
      }
      await refreshRawState(context);
      break;

    case 'tool-input-available':
      // Store toolName in map for later output events
      if (eventData.toolCallId && eventData.toolName) {
        context.toolCallNameMap.set(eventData.toolCallId, eventData.toolName);
        console.log(`[persistent-processor] 🔧 Tool started: ${eventData.toolName} (${eventData.toolCallId})`);
      }

      if (eventData.toolName === 'TodoWrite') {
        const todos = Array.isArray(eventData.input?.todos) ? eventData.input.todos : [];

        // CRITICAL: Wait for ALL todos to be persisted BEFORE continuing
        await Promise.all(todos.map((todo, index: number) => persistTodo(context, todo, index)));

        // Trim any leftover todos/tool data beyond the current list length
        await pruneTodoTail(context, todos.length);

        // Update active todo index for subsequent events
        context.currentActiveTodoIndex = todos.findIndex((t) => t.status === 'in_progress');
        // Quiet: Active todo index updated

        // Persist TodoWrite as a tool call
        await persistToolCall(context, eventData, 'input-available');

        // CRITICAL: Refresh state NOW to ensure frontend has todos before tools arrive
        await refreshRawState(context);
        // Quiet: Todos persisted successfully
        
        // Broadcast todo update via WebSocket (high priority - immediate flush)
        buildWebSocketServer.broadcastTodoUpdate(context.projectId, context.sessionId, todos);

        // AUTO-FINALIZE: If all todos are complete, finalize the build
        // This handles cases where build-completed event is delayed or missing
        const allComplete = todos.length > 0 && todos.every((t) => t.status === 'completed');
        if (allComplete) {
          console.log(`[persistent-processor] 🎉 All todos complete - auto-finalizing build ${context.commandId}`);
          await finalizeSession(context, 'completed', timestamp);
          // Note: Don't cleanup yet - build-completed event might still arrive
          // Just mark as complete so UI updates
        }

        // Don't call refreshRawState again at the end - we already did it
        return;
      } else if (eventData.toolName) {
        // Inject active todo index into tool event before persisting
        if (!eventData.todoIndex && context.currentActiveTodoIndex >= 0) {
          eventData.todoIndex = context.currentActiveTodoIndex;
          console.log(`[persistent-processor] Injected todoIndex ${context.currentActiveTodoIndex} into ${eventData.toolName} tool`);
        }
        await persistToolCall(context, eventData, 'input-available');

        // Broadcast tool call via WebSocket with explicit todoIndex
        const todoIndex = typeof eventData.todoIndex === 'number'
          ? eventData.todoIndex
          : context.currentActiveTodoIndex;

        buildWebSocketServer.broadcastToolCall(context.projectId, context.sessionId, {
          id: eventData.toolCallId || '',
          name: eventData.toolName,
          todoIndex: todoIndex,
          input: eventData.input,
          state: 'input-available',
        });

        const messageId = typeof eventData.messageId === 'string'
          ? eventData.messageId
          : context.currentMessageId;
        if (messageId) {
          const buffer = getOrCreateMessageBuffer(context, messageId);
          let part = buffer.parts.find(p => p.toolCallId === eventData.toolCallId);
          if (!part) {
            part = {
              type: `tool-${eventData.toolName}`,
              toolCallId: eventData.toolCallId,
              toolName: eventData.toolName,
              input: eventData.input,
              state: 'input-available',
            };
            buffer.parts.push(part);
          } else {
            part.input = eventData.input;
            part.state = 'input-available';
          }
          await persistMessageBuffer(context, messageId);
        }
      }

      // Only refresh if we didn't already refresh for TodoWrite
      if (eventData.toolName !== 'TodoWrite') {
        await refreshRawState(context);
      }
      break;

    case 'tool-output-available':
      console.log(`[persistent-processor] ✅ Tool completed: ${eventData.toolName || 'unknown'} (${eventData.toolCallId || 'no-id'})`);

      // Try to restore toolName from map if missing
      if (!eventData.toolName && eventData.toolCallId) {
        const storedToolName = context.toolCallNameMap.get(eventData.toolCallId);
        if (storedToolName) {
          eventData.toolName = storedToolName;
          console.log(`[persistent-processor]    Restored toolName from map: ${storedToolName}`);
        }
      }

      await persistToolCall(context, eventData, 'output-available');

      // Broadcast tool completion via WebSocket with explicit todoIndex
      if (eventData.toolName) {
        const todoIndex = typeof eventData.todoIndex === 'number'
          ? eventData.todoIndex
          : context.currentActiveTodoIndex;
        
        // Capture current trace context for distributed tracing
        const activeSpan = Sentry.getActiveSpan();
        const traceContext = activeSpan ? {
          trace: Sentry.getTraceData()['sentry-trace'],
          baggage: Sentry.getTraceData().baggage,
        } : undefined;
        
        buildWebSocketServer.broadcastToolCall(
          context.projectId, 
          context.sessionId, 
          {
            id: eventData.toolCallId || '',
            name: eventData.toolName,
            todoIndex: todoIndex,
            input: undefined,
            state: 'output-available',
          },
          traceContext
        );

        const messageId = typeof eventData.messageId === 'string'
          ? eventData.messageId
          : context.currentMessageId;
        if (messageId) {
          const buffer = getOrCreateMessageBuffer(context, messageId);
          let part = buffer.parts.find(p => p.toolCallId === eventData.toolCallId);
          if (!part) {
            part = {
              type: `tool-${eventData.toolName}`,
              toolCallId: eventData.toolCallId,
              toolName: eventData.toolName,
              state: 'output-available',
            };
            buffer.parts.push(part);
          }
          part.output = eventData.output;
          part.state = 'output-available';
          await persistMessageBuffer(context, messageId);
        }
      }

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

      {
        const messageId = typeof eventData.messageId === 'string'
          ? eventData.messageId
          : context.currentMessageId;
        if (messageId && typeof eventData.delta === 'string') {
          const buffer = getOrCreateMessageBuffer(context, messageId);
          const lastPart = buffer.parts[buffer.parts.length - 1];
          if (lastPart && lastPart.type === 'text') {
            lastPart.text = (lastPart.text ?? '') + eventData.delta;
          } else {
            buffer.parts.push({ type: 'text', text: eventData.delta });
          }
          await persistMessageBuffer(context, messageId);
        }
      }
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
      // Message finished - do NOT finalize the build
      // 'finish' is a message-level event, not a build-level event
      // Build finalization only happens on 'build-completed' or 'build-failed' events
      // For Codex with multi-turn workflows, each turn finishes multiple messages
      // but the build isn't done until all turns complete
      await refreshRawState(context);
      if (context.currentMessageId) {
        await persistMessageBuffer(context, context.currentMessageId);
        context.messageBuffers.delete(context.currentMessageId);
        context.currentMessageId = null;
      }
      break;

    case 'error':
      // Error in message - log but don't finalize build
      // Only 'build-failed' events should finalize the build
      console.warn('[persistent-processor] Message error occurred:', eventData);
      await refreshRawState(context);
      if (context.currentMessageId) {
        await persistMessageBuffer(context, context.currentMessageId);
      }
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
 * @param agentId - Agent being used (claude-code or openai-codex)
 * @param claudeModelId - Claude model ID if using Claude Code
 * @returns Cleanup function to manually stop tracking (optional - will auto-cleanup on finish/error)
 */
export function registerBuild(
  commandId: string,
  sessionId: string,
  projectId: string,
  buildId: string,
  agentId: string,
  claudeModelId?: string
): () => void {
  // Check if already registered
  if (activeBuilds.has(commandId)) {
    console.warn(`[persistent-processor] Build ${commandId} already registered`);
    return () => cleanupBuild(commandId);
  }

  console.log(`[persistent-processor] 📝 Registering build ${commandId} for persistent tracking`);
  console.log(`[persistent-processor]    Agent: ${agentId}${claudeModelId ? ` (${claudeModelId})` : ''}`);

  const context: ActiveBuildContext = {
    commandId,
    sessionId,
    projectId,
    buildId,
    agentId,
    claudeModelId,
    unsubscribe: () => {},
    toolCallNameMap: new Map(),
    currentActiveTodoIndex: -1,
    startedAt: new Date(),
    currentMessageId: null,
    messageBuffers: new Map(),
    stateVersion: 0,
    refreshPromise: null, // Initialize mutex for serializing state refreshes
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
          
          // Wrap persistEvent in span for database tracing
          await Sentry.startSpan(
            {
              name: `persistent-processor.persistEvent.${eventData.type}`,
              op: 'db.persist.event',
              attributes: {
                'event.type': eventData.type,
                'event.projectId': context.projectId,
                'event.sessionId': context.sessionId,
                'event.commandId': commandId,
              },
            },
            async () => {
              await persistEvent(context, eventData);
            }
          );
        }
      } else if (event.type === 'build-completed') {
        console.log(`[persistent-processor] 🎉 Received build-completed event for ${commandId}`);
        
        // Wrap finalize in span
        await Sentry.startSpan(
          {
            name: 'persistent-processor.finalizeSession.completed',
            op: 'db.persist.finalize',
            attributes: {
              'event.projectId': context.projectId,
              'event.sessionId': context.sessionId,
              'event.commandId': commandId,
              'session.status': 'completed',
            },
          },
          async () => {
            await finalizeSession(context, 'completed', new Date());
          }
        );
        cleanupBuild(commandId);
      } else if (event.type === 'build-failed' || event.type === 'error') {
        console.log(`[persistent-processor] ❌ Received build-failed/error event for ${commandId}`);
        
        // Wrap finalize in span
        await Sentry.startSpan(
          {
            name: 'persistent-processor.finalizeSession.failed',
            op: 'db.persist.finalize',
            attributes: {
              'event.projectId': context.projectId,
              'event.sessionId': context.sessionId,
              'event.commandId': commandId,
              'session.status': 'failed',
            },
          },
          async () => {
            await finalizeSession(context, 'failed', new Date());
          }
        );
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
