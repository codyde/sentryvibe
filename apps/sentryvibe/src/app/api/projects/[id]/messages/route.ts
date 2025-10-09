import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { messages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

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

    return NextResponse.json({ messages: formattedMessages });
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
