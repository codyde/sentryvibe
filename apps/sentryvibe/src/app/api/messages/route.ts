import { NextResponse } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { messages } from '@sentryvibe/agent-core/lib/db/schema';
import { desc } from 'drizzle-orm';

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
      .orderBy(desc(messages.createdAt));

    const formattedMessages = allMessages.map((msg) => ({
      id: msg.id,
      projectId: msg.projectId,
      type: msg.role, // Map DB role to Message type
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      timestamp: msg.createdAt.getTime(),
    }));

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

    if (!message.projectId || !message.type) {
      return NextResponse.json(
        { error: 'projectId and type are required' },
        { status: 400 }
      );
    }

    // Insert into database (type maps to role in DB)
    const [newMessage] = await db
      .insert(messages)
      .values({
        id: message.id || crypto.randomUUID(), // Use provided ID or generate
        projectId: message.projectId,
        role: message.type, // Map type → role for DB
        content: message.content || '',
      })
      .returning();

    console.log('✅ [API] Message inserted to PostgreSQL:', newMessage.id);

    return NextResponse.json({ message: newMessage });
  } catch (error) {
    console.error('Error creating message:', error);
    return NextResponse.json(
      { error: 'Failed to create message' },
      { status: 500 }
    );
  }
}
