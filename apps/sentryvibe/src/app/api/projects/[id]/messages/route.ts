import { NextResponse } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import {
  messages,
  generationSessions,
  generationTodos,
  generationToolCalls,
  generationNotes,
} from '@sentryvibe/agent-core/lib/db/schema';
import { eq, desc, inArray, sql } from 'drizzle-orm';
import { deserializeGenerationState } from '@sentryvibe/agent-core/lib/generation-persistence';
import { cleanupStuckBuilds } from '@sentryvibe/agent-core/lib/runner/persistent-event-processor';
import type { GenerationState, ToolCall, TextMessage, TodoItem } from '@/types/generation';
import * as Sentry from '@sentry/nextjs';

function serializeContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  try {
    return JSON.stringify(content);
  } catch (error) {
    console.error('Failed to serialize message content, storing as string', error);
    return JSON.stringify({ type: 'text', text: String(content) });
  }
}

function parseMessageContent(raw: unknown) {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return raw;

  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      // try to normalise single quotes / unquoted keys (from legacy rows)
      try {
        const normalised = trimmed
          .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
          .replace(/'/g, '"');
        return JSON.parse(normalised);
      } catch (secondaryError) {
        console.warn('Failed to parse message content, returning raw text', {
          error: secondaryError,
          preview: trimmed.slice(0, 200),
        });
      }
    }
  }

  return [{
    type: 'text',
    text: trimmed,
  }];
}

// GET /api/projects/:id/messages - Get all messages for a project
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // CLEANUP: On reconnection, check for and finalize stuck builds
    // This runs every time a user reconnects/refreshes, providing natural cleanup
    // without requiring external cronjobs or scheduled tasks
    try {
      await cleanupStuckBuilds(5); // Finalize builds inactive for 5+ minutes
    } catch (cleanupError) {
      // Don't block the request if cleanup fails
      console.error('[messages-route] Cleanup failed (non-fatal):', cleanupError);
    }

    // Fetch messages with performance tracking
    const projectMessages = await Sentry.startSpan(
      {
        name: 'db.query.messages',
        op: 'db.query',
        attributes: { 'project.id': id, 'db.table': 'messages' },
      },
      async () => {
        return await db
          .select()
          .from(messages)
          .where(eq(messages.projectId, id))
          .orderBy(messages.createdAt);
      }
    );

    const formattedMessages = projectMessages.map(msg => ({
      ...msg,
      content: parseMessageContent(msg.content),
    }));

    // Fetch generation sessions with performance tracking
    const sessions = await Sentry.startSpan(
      {
        name: 'db.query.generationSessions',
        op: 'db.query',
        attributes: { 'project.id': id, 'db.table': 'generation_sessions' },
      },
      async () => {
        return await db
          .select()
          .from(generationSessions)
          .where(eq(generationSessions.projectId, id))
          .orderBy(desc(generationSessions.startedAt));
      }
    );

    const sessionIds = sessions.map(session => session.id);

    // Fetch todos, tool calls, and notes in parallel with performance tracking
    const [todos, toolCalls, notes] = await Promise.all([
      sessionIds.length > 0
        ? Sentry.startSpan(
            {
              name: 'db.query.generationTodos',
              op: 'db.query',
              attributes: { 'db.table': 'generation_todos', 'session.count': sessionIds.length },
            },
            async () => {
              return await db
                .select()
                .from(generationTodos)
                .where(inArray(generationTodos.sessionId, sessionIds))
                .orderBy(generationTodos.todoIndex);
            }
          )
        : Promise.resolve([]),
      sessionIds.length > 0
        ? Sentry.startSpan(
            {
              name: 'db.query.generationToolCalls',
              op: 'db.query',
              attributes: { 'db.table': 'generation_tool_calls', 'session.count': sessionIds.length },
            },
            async () => {
              return await db
                .select()
                .from(generationToolCalls)
                .where(inArray(generationToolCalls.sessionId, sessionIds));
            }
          )
        : Promise.resolve([]),
      sessionIds.length > 0
        ? Sentry.startSpan(
            {
              name: 'db.query.generationNotes',
              op: 'db.query',
              attributes: { 'db.table': 'generation_notes', 'session.count': sessionIds.length },
            },
            async () => {
              return await db
                .select()
                .from(generationNotes)
                .where(inArray(generationNotes.sessionId, sessionIds))
                .orderBy(generationNotes.createdAt);
            }
          )
        : Promise.resolve([]),
    ]);

    const sessionsWithRelations = sessions.map(session => {
      const sessionTodos = todos.filter(todo => todo.sessionId === session.id);
      const sessionTools = toolCalls.filter(tool => tool.sessionId === session.id);
      const sessionNotes = notes.filter(note => note.sessionId === session.id);

      let hydratedState: GenerationState | null = null;
      let rawStateObj: Record<string, unknown> | null = null;
      
      // Try to parse rawState for metadata extraction
      if (session.rawState) {
        try {
          rawStateObj = typeof session.rawState === 'string' 
            ? JSON.parse(session.rawState)
            : session.rawState as Record<string, unknown>;
        } catch (err) {
          console.warn('[messages-route] Failed to parse rawState:', err);
        }
      }
      
      // Try full deserialization first
      if (session.rawState && typeof session.rawState === 'string') {
        hydratedState = deserializeGenerationState(session.rawState);
      }

      // Fallback: Build state from database tables if deserialization failed
      if (!hydratedState) {
        // Extract agent metadata from rawState even if full deserialization failed
        const agentId = rawStateObj?.agentId as GenerationState['agentId'] | undefined;
        const claudeModelId = rawStateObj?.claudeModelId as GenerationState['claudeModelId'] | undefined;
        const projectName = rawStateObj?.projectName as string | undefined;
        
        hydratedState = {
          id: session.buildId,
          projectId: session.projectId,
          projectName: projectName || '',
          operationType: session.operationType as GenerationState['operationType'],
          agentId: agentId,
          claudeModelId: claudeModelId,
          todos: sessionTodos.map(todo => ({
            content: todo.content,
            status: todo.status as TodoItem['status'],
            activeForm: todo.activeForm ?? todo.content,
          })),
          toolsByTodo: sessionTodos.reduce((acc, todo) => {
            const tools = sessionTools.filter(tool => tool.todoIndex === todo.todoIndex);
            if (tools.length > 0) {
              acc[todo.todoIndex] = tools.map(tool => ({
                id: tool.toolCallId ?? tool.id,
                name: tool.name,
                input: tool.input ?? undefined,
                output: tool.output ?? undefined,
                state: tool.state as ToolCall['state'],
                startTime: tool.startedAt ?? new Date(),
                endTime: tool.endedAt ?? undefined,
              }));
            }
            return acc;
          }, {} as Record<number, ToolCall[]>),
          textByTodo: sessionTodos.reduce((acc, todo) => {
            const notesForTodo = sessionNotes.filter(note => note.todoIndex === todo.todoIndex);
            if (notesForTodo.length > 0) {
              acc[todo.todoIndex] = notesForTodo.map(note => ({
                id: note.textId ?? note.id,
                text: note.content,
                timestamp: note.createdAt ?? new Date(),
              }));
            }
            return acc;
          }, {} as Record<number, TextMessage[]>),
          activeTodoIndex: sessionTodos.findIndex(todo => todo.status === 'in_progress'),
          isActive: session.status === 'active',
          startTime: session.startedAt ?? new Date(),
          endTime: session.endedAt ?? undefined,
          codex: rawStateObj?.codex as GenerationState['codex'] | undefined,
        };
      }

      // RECONNECTION DETECTION: Check for state inconsistencies
      // If all todos are complete but session is still active, mark as complete
      if (hydratedState && session.status === 'active') {
        const allTodosComplete = hydratedState.todos.length > 0 &&
          hydratedState.todos.every(todo => todo.status === 'completed');

        if (allTodosComplete) {
          console.log(`[messages-route] 🔄 Detected completed build with active session: ${session.id}`);
          hydratedState.isActive = false;
          hydratedState.endTime = hydratedState.endTime ?? new Date();

          // Update session status in background (don't block response)
          db.update(generationSessions)
            .set({
              status: 'completed',
              endedAt: hydratedState.endTime,
              updatedAt: new Date()
            })
            .where(eq(generationSessions.id, session.id))
            .catch(err => console.error('[messages-route] Failed to update session status:', err));
        }
      }

      return {
        session,
        todos: sessionTodos,
        tools: sessionTools,
        notes: sessionNotes,
        hydratedState,
      };
    });

    return NextResponse.json({
      messages: formattedMessages,
      sessions: sessionsWithRelations,
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

// POST /api/projects/:id/messages - Save a new message
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { role, content } = await req.json();

    if (!role || content === undefined) {
      return NextResponse.json({ error: 'Role and content are required' }, { status: 400 });
    }

    if (role !== 'user' && role !== 'assistant') {
      return NextResponse.json({ error: 'Role must be "user" or "assistant"' }, { status: 400 });
    }

    const [newMessage] = await db
      .insert(messages)
      .values({
        projectId: id,
        role: role,
        content: serializeContent(content),
      })
      .returning();

    const formatted = {
      ...newMessage,
      content: parseMessageContent(newMessage.content),
    };

    return NextResponse.json({ message: formatted });
  } catch (error) {
    console.error('Error saving message:', error);
    return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
  }
}
