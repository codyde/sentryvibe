import { NextResponse } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { messages } from '@sentryvibe/agent-core/lib/db/schema';
import { desc, sql } from 'drizzle-orm';

/**
 * Serialize message parts to string for database storage
 */
function serializeContent(parts: unknown): string {
  if (typeof parts === 'string') {
    return parts;
  }
  try {
    return JSON.stringify(parts);
  } catch (error) {
    console.error('Failed to serialize message parts:', error);
    return JSON.stringify([{ type: 'text', text: String(parts) }]);
  }
}

/**
 * Parse message content from database
 */
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
      console.warn('Failed to parse message content:', error);
      return [{ type: 'text', text: trimmed }];
    }
  }

  return [{ type: 'text', text: trimmed }];
}

/**
 * GET /api/messages
 * Fetch all messages across all projects (for TanStack DB QueryCollection)
 *
 * Returns simplified Message structure:
 * - type: 'user' | 'assistant' | 'system' | 'tool-call' | 'tool-result'
 * - content: simple string (not parts array)
 */
export async function GET() {
  try {
    const allMessages = await db
      .select()
      .from(messages)
      .where(
        // Only load user and assistant messages (skip system/tool messages)
        sql`role IN ('user', 'assistant')`
      )
      .orderBy(desc(messages.createdAt))
      .limit(100); // Performance: Only load recent 100 messages

    const formattedMessages = allMessages
      .map((msg) => {
        let content = msg.content;

        // Handle old JSON-formatted content: [{"type":"text","text":"..."}]
        if (typeof content === 'string' && content.trim().startsWith('[')) {
          try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) {
              // Check if this is a tool message (has tool-* type parts)
              const hasToolParts = parsed.some((p: any) =>
                typeof p.type === 'string' && p.type.startsWith('tool-')
              );

              // Skip messages that are primarily tool calls
              if (hasToolParts) {
                return null; // Will be filtered out
              }

              // Extract ONLY text parts
              const textParts = parsed
                .filter((p: any) => p.type === 'text' && p.text)
                .map((p: any) => p.text)
                .join(' ');

              content = textParts;
            }
          } catch {
            // If parse fails, use as-is
          }
        }

        // Skip empty content
        if (!content || content.trim().length === 0) {
          return null; // Will be filtered out
        }

        return {
          id: msg.id,
          projectId: msg.projectId,
          type: msg.role, // Map DB role to Message type
          content: typeof content === 'string' ? content : JSON.stringify(content),
          timestamp: msg.createdAt.getTime(),
        };
      })
      .filter((msg): msg is NonNullable<typeof msg> => msg !== null); // Remove nulls

    console.log(`[API] Loaded ${formattedMessages.length} chat messages (filtered user/assistant only)`);

    return NextResponse.json({ messages: formattedMessages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/messages
 * Create a new message (for TanStack DB collection onInsert)
 *
 * Accepts simplified Message structure:
 * - type: 'user' | 'assistant' | 'system' | 'tool-call' | 'tool-result'
 * - content: simple string
 */
export async function POST(req: Request) {
  try {
    const message = await req.json();

    console.log('[API] POST /api/messages - Received:', {
      id: message.id,
      projectId: message.projectId,
      type: message.type,
      contentLength: message.content?.length,
    });

    if (!message.projectId || !message.type) {
      console.error('[API] Missing required fields:', { projectId: message.projectId, type: message.type });
      return NextResponse.json(
        { error: 'projectId and type are required' },
        { status: 400 }
      );
    }

    // Insert into database (type maps to role in DB)
    // Use client-provided UUID so collection ID matches database ID
    const [newMessage] = await db
      .insert(messages)
      .values({
        id: message.id, // Use client-provided UUID (from crypto.randomUUID())
        projectId: message.projectId,
        role: message.type, // Map type → role for DB
        content: message.content || '',
      })
      .returning();

    console.log('✅ [API] Message inserted to PostgreSQL:', newMessage.id);

    return NextResponse.json({ message: newMessage });
  } catch (error) {
    console.error('❌ [API] Error creating message:', error);
    console.error('[API] Error details:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to create message', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
