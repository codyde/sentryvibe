import { NextResponse } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import {
  messages,
  generationSessions,
  generationTodos,
  generationToolCalls,
  generationNotes,
} from '@sentryvibe/agent-core/lib/db/schema';
import { eq, desc, inArray } from 'drizzle-orm';
import { deserializeGenerationState } from '@sentryvibe/agent-core/lib/generation-persistence';
import type { GenerationState, ToolCall, TextMessage, TodoItem, TimelineEvent } from '@/types/generation';

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
    const projectMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.projectId, id))
      .orderBy(messages.createdAt);

    const formattedMessages = projectMessages.map(msg => ({
      ...msg,
      content: parseMessageContent(msg.content),
    }));

    const sessions = await db
      .select()
      .from(generationSessions)
      .where(eq(generationSessions.projectId, id))
      .orderBy(desc(generationSessions.startedAt));

    const sessionIds = sessions.map(session => session.id);

    const todos = sessionIds.length > 0
      ? await db
        .select()
        .from(generationTodos)
        .where(inArray(generationTodos.sessionId, sessionIds))
        .orderBy(generationTodos.todoIndex)
      : [];

    const toolCalls = sessionIds.length > 0
      ? await db
        .select()
        .from(generationToolCalls)
        .where(inArray(generationToolCalls.sessionId, sessionIds))
      : [];

    const notes = sessionIds.length > 0
      ? await db
        .select()
        .from(generationNotes)
        .where(inArray(generationNotes.sessionId, sessionIds))
        .orderBy(generationNotes.createdAt)
      : [];

    const sessionsWithRelations = sessions.map(session => {
      const sessionTodos = todos.filter(todo => todo.sessionId === session.id);
      const sessionTools = toolCalls.filter(tool => tool.sessionId === session.id);
      const sessionNotes = notes.filter(note => note.sessionId === session.id);

      let hydratedState: GenerationState | null = null;
      if (session.rawState && typeof session.rawState === 'string') {
        hydratedState = deserializeGenerationState(session.rawState);
      }

      if (!hydratedState) {
        // Build timeline: chronological list of all events
        const timeline: TimelineEvent[] = [];

        // Add todos to timeline
        sessionTodos.forEach((todo, index) => {
          timeline.push({
            id: `todo-${index}`,
            timestamp: todo.createdAt ?? new Date(),
            type: 'todo',
            todoIndex: index,
            data: {
              content: todo.content,
              status: todo.status as TodoItem['status'],
              activeForm: todo.activeForm ?? todo.content,
            },
          });
        });

        // Add tools to timeline
        sessionTools.forEach((tool) => {
          timeline.push({
            id: tool.toolCallId ?? tool.id,
            timestamp: tool.startedAt ?? new Date(),
            type: 'tool',
            todoIndex: tool.todoIndex ?? undefined,
            data: {
              id: tool.toolCallId ?? tool.id,
              name: tool.name,
              input: tool.input ?? undefined,
              output: tool.output ?? undefined,
              state: tool.state as ToolCall['state'],
              startTime: tool.startedAt ?? new Date(),
              endTime: tool.endedAt ?? undefined,
            },
          });
        });

        // Add text/reasoning notes to timeline
        sessionNotes.forEach((note) => {
          timeline.push({
            id: note.textId ?? note.id,
            timestamp: note.createdAt ?? new Date(),
            type: note.kind === 'reasoning' ? 'reasoning' : 'text',
            todoIndex: note.todoIndex ?? undefined,
            data: {
              id: note.textId ?? note.id,
              text: note.content,
              timestamp: note.createdAt ?? new Date(),
            },
          });
        });

        // Sort timeline chronologically
        timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        hydratedState = {
          id: session.buildId,
          projectId: session.projectId,
          projectName: '',
          operationType: session.operationType as GenerationState['operationType'],
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
          timeline, // Add timeline data
          activeTodoIndex: sessionTodos.findIndex(todo => todo.status === 'in_progress'),
          isActive: session.status === 'active',
          startTime: session.startedAt ?? new Date(),
          endTime: session.endedAt ?? undefined,
        };
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

    const newMessage = await db.insert(messages).values({
      projectId: id,
      role,
      content: serializeContent(content),
    }).returning();

    const formatted = {
      ...newMessage[0],
      content: parseMessageContent(newMessage[0].content),
    };

    return NextResponse.json({ message: formatted });
  } catch (error) {
    console.error('Error saving message:', error);
    return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
  }
}
