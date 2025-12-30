import { NextResponse } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import {
  messages,
  generationSessions,
  generationTodos,
  generationToolCalls,
} from '@sentryvibe/agent-core/lib/db/schema';
import { eq, desc, inArray, and, sql } from 'drizzle-orm';
import { deserializeGenerationState } from '@sentryvibe/agent-core/lib/generation-persistence';
import { cleanupStuckBuilds } from '@sentryvibe/agent-core/lib/runner/persistent-event-processor';
import type { GenerationState, ToolCall, TodoItem } from '@/types/generation';

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
    // NOTE: 15 minutes of INACTIVITY (no events), not total build time
    try {
      await cleanupStuckBuilds(15); // Finalize builds inactive for 15+ minutes
    } catch (cleanupError) {
      // Don't block the request if cleanup fails
      console.error('[messages-route] Cleanup failed (non-fatal):', cleanupError);
    }

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

    // Fetch todos and tool calls (notes removed - no longer persisted)
    const [todos, toolCalls] = await Promise.all([
      sessionIds.length > 0
        ? db
            .select()
            .from(generationTodos)
            .where(inArray(generationTodos.sessionId, sessionIds))
            .orderBy(generationTodos.todoIndex)
        : Promise.resolve([]),
      sessionIds.length > 0
        ? db
            .select()
            .from(generationToolCalls)
            .where(and(
              inArray(generationToolCalls.sessionId, sessionIds),
              sql`${generationToolCalls.todoIndex} >= 0`, // No pre-todo tools
              sql`${generationToolCalls.state} IN ('output-available', 'error')` // Only completed
            ))
        : Promise.resolve([]),
    ]);

    const sessionsWithRelations = sessions.map(session => {
      const sessionTodos = todos.filter(todo => todo.sessionId === session.id);
      const sessionTools = toolCalls.filter(tool => tool.sessionId === session.id);

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
        // Ensure buildSummary from DB is included even if deserialization worked
        if (hydratedState && session.summary && !hydratedState.buildSummary) {
          hydratedState.buildSummary = session.summary;
        }
        // Ensure auto-fix fields from DB are included
        const sessionWithAutoFix = session as typeof session & { isAutoFix?: boolean; autoFixError?: string | null };
        if (hydratedState) {
          hydratedState.isAutoFix = sessionWithAutoFix.isAutoFix ?? hydratedState.isAutoFix ?? false;
          hydratedState.autoFixError = sessionWithAutoFix.autoFixError ?? hydratedState.autoFixError ?? undefined;
        }
      }

      // Fallback: Build state from database tables if deserialization failed
      if (!hydratedState) {
        // Extract agent metadata from rawState even if full deserialization failed
        const agentId = rawStateObj?.agentId as GenerationState['agentId'] | undefined;
        const claudeModelId = rawStateObj?.claudeModelId as GenerationState['claudeModelId'] | undefined;
        const projectName = rawStateObj?.projectName as string | undefined;

        // Access session with auto-fix fields (type assertion for new fields)
        const sessionWithAutoFix = session as typeof session & { isAutoFix?: boolean; autoFixError?: string | null };

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
          // textByTodo removed - notes no longer persisted
          textByTodo: {},
          activeTodoIndex: sessionTodos.findIndex(todo => todo.status === 'in_progress'),
          isActive: session.status === 'active',
          startTime: session.startedAt ?? new Date(),
          endTime: session.endedAt ?? undefined,
          codex: rawStateObj?.codex as GenerationState['codex'] | undefined,
          // Load build summary from session if available
          buildSummary: session.summary ?? undefined,
          // Auto-fix tracking
          isAutoFix: sessionWithAutoFix.isAutoFix ?? false,
          autoFixError: sessionWithAutoFix.autoFixError ?? undefined,
        };
      }

      // RECONNECTION DETECTION: Check for state inconsistencies
      // If all todos are complete but session is still active, mark as complete
      if (hydratedState && session.status === 'active') {
        const allTodosComplete = hydratedState.todos.length > 0 &&
          hydratedState.todos.every(todo => todo.status === 'completed');
        
        // Also check for builds with no todos but that have a summary (quick follow-ups)
        // These are completed builds that skipped the todo phase
        const isCompletedWithoutTodos = hydratedState.todos.length === 0 && 
          (session.summary || session.endedAt);

        if (allTodosComplete || isCompletedWithoutTodos) {
          console.log(`[messages-route] 🔄 Detected completed build with active session: ${session.id}`, {
            allTodosComplete,
            isCompletedWithoutTodos,
            hasSummary: !!session.summary,
            hasEndedAt: !!session.endedAt,
          });
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
    const { role, content, parts } = await req.json();

    if (!role) {
      return NextResponse.json({ error: 'Role is required' }, { status: 400 });
    }

    if (!content && (!parts || parts.length === 0)) {
      return NextResponse.json(
        { error: 'Content or parts are required' },
        { status: 400 }
      );
    }

    if (role !== 'user' && role !== 'assistant') {
      return NextResponse.json({ error: 'Role must be "user" or "assistant"' }, { status: 400 });
    }

    // Serialize content (may be string or parts array)
    let serializedContent: string;
    if (parts && parts.length > 0) {
      serializedContent = JSON.stringify(parts);
    } else {
      serializedContent = serializeContent(content);
    }

    const [newMessage] = await db
      .insert(messages)
      .values({
        projectId: id,
        role: role,
        content: serializedContent,
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
