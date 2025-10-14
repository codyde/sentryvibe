import { randomUUID } from 'crypto';
import type { BuildRequest } from '@/types/build';
import { sendCommandToRunner } from '@/lib/runner/broker-state';
import { addRunnerEventSubscriber } from '@/lib/runner/event-stream';
import type { RunnerEvent } from '@/shared/runner/messages';
import { db } from '@/lib/db/client';
import {
  projects,
  messages,
  generationSessions,
  generationTodos,
  generationToolCalls,
  generationNotes,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { TodoItem, ToolCall, GenerationState, TextMessage } from '@sentryvibe/agent-core/src/types/generation';
import { serializeGenerationState } from '@sentryvibe/agent-core/src/lib/generation-persistence';
import { DEFAULT_AGENT_ID } from '@sentryvibe/agent-core/src/types/agent';

export const maxDuration = 30;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let commandId: string | undefined;
  let cleanup: (() => void) | null = null;
  try {
    const { id } = await params;
    const body = (await req.json()) as BuildRequest;

    if (!body?.operationType || !body?.prompt) {
      return new Response(JSON.stringify({ error: 'operationType and prompt are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get project details for slug
    const project = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (project.length === 0) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    commandId = randomUUID();
    const runnerId = body.runnerId || process.env.RUNNER_DEFAULT_ID || 'default';
    const agentId = body.agent ?? DEFAULT_AGENT_ID;
    console.log('[build-route] Using agent for build:', agentId);
    const encoder = new TextEncoder();

    // Track messages for DB persistence
    let currentMessageParts: Array<{type: string; text?: string; toolCallId?: string; toolName?: string; input?: unknown; output?: unknown}> = [];
    let currentMessageId: string | null = null;
    const completedMessages: Array<{role: 'assistant'; content: any[]}> = [];

    // Map toolCallId to toolName for output events that don't include toolName
    const toolCallNameMap = new Map<string, string>();

    // Save user message first
    await db.insert(messages).values({
      projectId: id,
      role: 'user',
      content: JSON.stringify([{ type: 'text', text: body.prompt }]),
    });

    const buildId = body.buildId ?? `build-${Date.now()}`;

    const existingSession = await db
      .select()
      .from(generationSessions)
      .where(eq(generationSessions.buildId, buildId))
      .limit(1);

    const now = new Date();
    let sessionId: string;

    if (existingSession.length > 0) {
      sessionId = existingSession[0].id;
      await db.update(generationSessions)
        .set({
          projectId: id,
          operationType: body.operationType ?? existingSession[0].operationType,
          status: 'active',
          startedAt: existingSession[0].startedAt ?? now,
          updatedAt: now,
        })
        .where(eq(generationSessions.id, sessionId));
    } else {
      const inserted = await db.insert(generationSessions).values({
        projectId: id,
        buildId,
        operationType: body.operationType,
        status: 'active',
        startedAt: now,
        updatedAt: now,
      }).returning();
      sessionId = inserted[0].id;
    }

    const buildSnapshot = async (): Promise<GenerationState> => {
      const [sessionRow] = await db
        .select()
        .from(generationSessions)
        .where(eq(generationSessions.id, sessionId))
        .limit(1);

      if (!sessionRow) {
        throw new Error('Generation session not found when building snapshot');
      }

      const todoRows = await db
        .select()
        .from(generationTodos)
        .where(eq(generationTodos.sessionId, sessionId))
        .orderBy(generationTodos.todoIndex);

      const toolRows = await db
        .select()
        .from(generationToolCalls)
        .where(eq(generationToolCalls.sessionId, sessionId));

      const noteRows = await db
        .select()
        .from(generationNotes)
        .where(eq(generationNotes.sessionId, sessionId))
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

      const snapshot: GenerationState = {
        id: sessionRow.buildId,
        projectId: sessionRow.projectId,
        projectName: project[0].name,
        operationType: (sessionRow.operationType ?? body.operationType) as GenerationState['operationType'],
        todos: todosSnapshot,
        toolsByTodo,
        textByTodo,
        activeTodoIndex: activeIndex,
        isActive: sessionRow.status === 'active',
        startTime: sessionRow.startedAt ?? now,
        endTime: sessionRow.endedAt ?? undefined,
      };

      return snapshot;
    };

    const refreshRawState = async () => {
      try {
        const snapshot = await buildSnapshot();
        const serialized = serializeGenerationState(snapshot);
        await db.update(generationSessions)
          .set({ rawState: serialized, updatedAt: new Date() })
          .where(eq(generationSessions.id, sessionId));
      } catch (snapshotError) {
        console.warn('[build-route] Failed to refresh raw generation state:', snapshotError);
      }
    };

    const finalizeSession = async (status: 'completed' | 'failed', timestamp: Date) => {
      await db.update(generationSessions)
        .set({ status, endedAt: timestamp, updatedAt: timestamp })
        .where(eq(generationSessions.id, sessionId));
      await refreshRawState();
    };

    const persistTodo = async (todo: any, index: number) => {
      const content = todo?.content ?? todo?.activeForm ?? 'Untitled task';
      const activeForm = todo?.activeForm ?? null;
      const status = todo?.status ?? 'pending';
      const timestamp = new Date();

      await db.insert(generationTodos).values({
        sessionId,
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
      });
    };

    const persistToolCall = async (eventData: any, state: 'input-available' | 'output-available') => {
      const toolCallId = eventData.toolCallId ?? eventData.id ?? randomUUID();
      const todoIndex = typeof eventData.todoIndex === 'number'
        ? eventData.todoIndex
        : typeof eventData.todo_index === 'number'
          ? eventData.todo_index
          : -1;

      const timestamp = new Date();

      // If toolName is missing and this is an output event, try to find the existing record
      if (!eventData.toolName && state === 'output-available') {
        const existing = await db
          .select()
          .from(generationToolCalls)
          .where(and(
            eq(generationToolCalls.sessionId, sessionId),
            eq(generationToolCalls.toolCallId, toolCallId),
          ))
          .limit(1);

        if (existing.length > 0) {
          // Update existing record
          await db.update(generationToolCalls)
            .set({
              output: eventData.output ?? null,
              state,
              endedAt: timestamp,
              updatedAt: timestamp,
            })
            .where(eq(generationToolCalls.id, existing[0].id));
          return;
        }
        // If no existing record and no toolName, we can't insert - skip it
        return;
      }

      // Ensure toolName exists for insert
      if (!eventData.toolName) {
        return;
      }

      await db.insert(generationToolCalls).values({
        sessionId,
        todoIndex,
        toolCallId,
        name: eventData.toolName,
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
      });
    };

    const appendNote = async (params: { textId?: string; content: string; kind: string; todoIndex: number }) => {
      const { textId, content, kind, todoIndex } = params;
      if (!content) return;
      const timestamp = new Date();

      if (textId) {
        const existing = await db
          .select()
          .from(generationNotes)
          .where(and(
            eq(generationNotes.sessionId, sessionId),
            eq(generationNotes.textId, textId),
          ))
          .limit(1);

        if (existing.length > 0) {
          await db.update(generationNotes)
            .set({
              content: existing[0].content + content,
            })
            .where(eq(generationNotes.id, existing[0].id));
          return;
        }
      }

      await db.insert(generationNotes).values({
        sessionId,
        todoIndex,
        textId: textId ?? null,
        kind,
        content,
        createdAt: timestamp,
      });
    };

    const persistEvent = async (eventData: any) => {
      if (!eventData || !sessionId) return;
      const timestamp = new Date();

      switch (eventData.type) {
        case 'start':
          await db.update(generationSessions)
            .set({
              status: 'active',
              updatedAt: timestamp,
            })
            .where(eq(generationSessions.id, sessionId));
          await refreshRawState();
          break;
        case 'tool-input-available':
          // Store toolName in map for later output events
          if (eventData.toolCallId && eventData.toolName) {
            toolCallNameMap.set(eventData.toolCallId, eventData.toolName);
          }

          if (eventData.toolName === 'TodoWrite') {
            const todos = Array.isArray(eventData.input?.todos) ? eventData.input.todos : [];
            await Promise.all(todos.map((todo: any, index: number) => persistTodo(todo, index)));
            // Also persist TodoWrite as a tool call for completeness
            await persistToolCall(eventData, 'input-available');
          } else if (eventData.toolName) {
            await persistToolCall(eventData, 'input-available');
          }
          await refreshRawState();
          break;
        case 'tool-output-available':
          // Try to restore toolName from map if missing
          if (!eventData.toolName && eventData.toolCallId) {
            const storedToolName = toolCallNameMap.get(eventData.toolCallId);
            if (storedToolName) {
              eventData.toolName = storedToolName;
            }
          }
          await persistToolCall(eventData, 'output-available');
          await refreshRawState();
          break;
        case 'text-delta':
          await appendNote({
            textId: eventData.id,
            content: eventData.delta ?? '',
            kind: 'text',
            todoIndex: typeof eventData.todoIndex === 'number' ? eventData.todoIndex : -1,
          });
          await refreshRawState();
          break;
        case 'data-reasoning':
        case 'reasoning':
          if (eventData.message || eventData.data?.message) {
            await appendNote({
              textId: eventData.id ?? undefined,
              content: eventData.message ?? eventData.data?.message ?? '',
              kind: 'reasoning',
              todoIndex: typeof eventData.todoIndex === 'number' ? eventData.todoIndex : -1,
            });
            await refreshRawState();
          }
          break;
        case 'finish':
          await finalizeSession('completed', timestamp);
          break;
        case 'error':
          await finalizeSession('failed', timestamp);
          break;
        default:
          break;
      }
    };

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;

        const writeChunk = async (chunk: string) => {
          if (closed) return;
          if (!chunk) return;

          // Parse events to track messages for DB
          try {
            const match = chunk.match(/data:\s*({.*})/);
            if (match) {
              const eventData = JSON.parse(match[1]);
              await persistEvent(eventData);

              // Track message lifecycle for legacy chat transcript
              if (eventData.type === 'start') {
                if (currentMessageId && currentMessageParts.length > 0) {
                  completedMessages.push({
                    role: 'assistant',
                    content: [...currentMessageParts],
                  });
                }
                currentMessageId = eventData.messageId;
                currentMessageParts = [];
              } else if (eventData.type === 'text-delta' && currentMessageId) {
                const existing = currentMessageParts.find(p => p.type === 'text' && !p.id);
                if (existing && 'text' in existing) {
                  existing.text = (existing.text || '') + (eventData.delta || '');
                } else {
                  currentMessageParts.push({ type: 'text', text: eventData.delta || '' });
                }
              } else if (eventData.type === 'tool-input-available' && eventData.toolName !== 'TodoWrite') {
                currentMessageParts.push({
                  type: `tool-${eventData.toolName}`,
                  toolCallId: eventData.toolCallId,
                  toolName: eventData.toolName,
                  input: eventData.input,
                  state: 'input-available',
                });
              } else if (eventData.type === 'tool-output-available') {
                const toolPart = currentMessageParts.find(p => p.toolCallId === eventData.toolCallId);
                if (toolPart) {
                  toolPart.output = eventData.output;
                  toolPart.state = 'output-available';
                }
              } else if (eventData.type === 'finish') {
                if (currentMessageId && currentMessageParts.length > 0) {
                  completedMessages.push({
                    role: 'assistant',
                    content: [...currentMessageParts],
                  });
                  currentMessageId = null;
                  currentMessageParts = [];
                }
              }
            }
          } catch (e) {
            console.warn('[build-route] failed to parse/persist event payload', e);
          }

          if (closed) return;

          const normalized = normalizeSSEChunk(chunk);
          if (!normalized) return;

          controller.enqueue(encoder.encode(normalized));
        };

        const unsubscribe = addRunnerEventSubscriber(commandId, async (event: RunnerEvent) => {
          switch (event.type) {
            case 'build-stream':
              if (typeof event.data === 'string') {
                await writeChunk(event.data);
              }
              break;
            case 'build-completed':
              finish();
              break;
            case 'build-failed': {
              const errorPayload = `data: ${JSON.stringify({ type: 'error', error: event.error })}\n\n`;
              writeChunk(errorPayload);
              writeChunk('data: [DONE]\n\n');
              finish();
              break;
            }
            case 'error': {
              const errorPayload = `data: ${JSON.stringify({ type: 'error', error: event.error })}\n\n`;
              writeChunk(errorPayload);
              writeChunk('data: [DONE]\n\n');
              finish();
              break;
            }
            default:
              break;
          }
        });

        const finish = async () => {
          if (closed) return;
          closed = true;

          // Save all completed messages to DB
          for (const msg of completedMessages) {
            try {
              await db.insert(messages).values({
                projectId: id,
                role: msg.role,
                content: JSON.stringify(msg.content),
              });
            } catch (error) {
              console.error('[build-route] Failed to save message:', error);
            }
          }

          // Messages saved to DB

          unsubscribe();

          // Safely close controller - it may already be closed
          try {
            controller.close();
          } catch (err) {
            // Controller already closed - this is fine
            if ((err as any).code !== 'ERR_INVALID_STATE') {
              console.warn('[build-route] Unexpected error closing controller:', err);
            }
          }
        };

        cleanup = finish;

        writeChunk(': runner-connected\n\n');
      },
      cancel() {
        cleanup?.();
      },
    });

    await sendCommandToRunner(runnerId, {
      id: commandId,
      type: 'start-build',
      projectId: id,
      timestamp: new Date().toISOString(),
      payload: {
        operationType: body.operationType,
        prompt: body.prompt,
        projectSlug: project[0].slug,
        projectName: project[0].name,
        context: body.context,
        agent: agentId,
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error) {
    console.error('❌ Build request failed:', error);

    cleanup?.();

    if (error instanceof Error && /not connected/i.test(error.message)) {
      return new Response(JSON.stringify({ error: 'Runner is not connected' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Build failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function normalizeSSEChunk(chunk: string): string | null {
  const sanitized = chunk.replace(/\r\n/g, '\n');
  const lines = sanitized.split('\n');

  let hasContent = false;
  const normalizedLines = lines.map((line) => {
    if (line.trim().length === 0) {
      return '';
    }

    hasContent = true;

    if (line.startsWith('data:') || line.startsWith(':')) {
      return line;
    }

    return `data: ${line}`;
  });

  if (!hasContent) {
    return null;
  }

  let normalized = normalizedLines.join('\n');

  // Ensure trailing double newline per SSE framing
  if (!normalized.endsWith('\n\n')) {
    normalized = normalized.replace(/\n*$/, '');
    normalized += '\n\n';
  }

  return normalized;
}
