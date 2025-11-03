import { NextResponse } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { messages } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';

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
 * PATCH /api/messages/[id]
 * Update an existing message (for TanStack DB collection onUpdate)
 *
 * Accepts simplified Message structure updates
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = await req.json();

    // Build update object for database
    const dbUpdates: any = {};

    if (updates.type) {
      dbUpdates.role = updates.type; // Map type → role for DB
    }

    if (updates.content !== undefined) {
      dbUpdates.content = updates.content;
    }

    // Update message in database
    const [updatedMessage] = await db
      .update(messages)
      .set(dbUpdates)
      .where(eq(messages.id, id))
      .returning();

    if (!updatedMessage) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: updatedMessage });
  } catch (error) {
    console.error('❌ [API] Update error:', error);
    return NextResponse.json(
      { error: 'Failed to update message' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/messages/[id]
 * Delete a message (for TanStack DB collection onDelete)
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [deletedMessage] = await db
      .delete(messages)
      .where(eq(messages.id, id))
      .returning();

    if (!deletedMessage) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ [API] Delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete message' },
      { status: 500 }
    );
  }
}
