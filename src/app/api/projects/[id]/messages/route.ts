import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { messages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

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

    // Drizzle with mode: 'json' should auto-parse, but let's ensure it
    const formattedMessages = projectMessages.map(msg => ({
      ...msg,
      content: typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content,
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

    if (!role || !content) {
      return NextResponse.json({ error: 'Role and content are required' }, { status: 400 });
    }

    if (role !== 'user' && role !== 'assistant') {
      return NextResponse.json({ error: 'Role must be "user" or "assistant"' }, { status: 400 });
    }

    const newMessage = await db.insert(messages).values({
      projectId: id,
      role,
      content,
    }).returning();

    return NextResponse.json({ message: newMessage[0] });
  } catch (error) {
    console.error('Error saving message:', error);
    return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
  }
}
