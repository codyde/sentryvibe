import { createCollection } from '@tanstack/react-db';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { queryClient } from '@/app/providers';
import type { Message } from '@/types/messages';

/**
 * Message Collection
 *
 * Syncs with PostgreSQL messages table via API endpoints.
 * Provides instant updates to UI via differential dataflow while
 * reliably persisting all messages to the database.
 *
 * Sync Strategy:
 * - Load: PostgreSQL → TanStack Query → Collection (automatic)
 * - Insert: Collection (instant UI) → onInsert → PostgreSQL (async)
 * - Update: Collection (instant UI) → onUpdate → PostgreSQL (async)
 * - Streaming: Use context.streaming flag to skip PostgreSQL saves during stream
 */
export const messageCollection = createCollection(
  queryCollectionOptions<Message, string>({
    queryClient,
    queryKey: ['messages'],
    queryFn: async () => {
      console.log('📥 [messageCollection] Fetching messages from PostgreSQL');

      const res = await fetch('/api/messages');
      if (!res.ok) {
        throw new Error('Failed to fetch messages from PostgreSQL');
      }

      const data = await res.json();
      const messages = data.messages || [];

      console.log(`✅ [messageCollection] Loaded ${messages.length} messages from PostgreSQL`);

      return messages;
    },
    getKey: (message) => message.id,

    // Sync new messages to PostgreSQL
    onInsert: async ({ transaction }) => {
      const { changes: message } = transaction.mutations[0];
      console.log('💾 [messageCollection] Inserting message to PostgreSQL:', message.id);

      try {
        const res = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });

        if (!res.ok) {
          throw new Error('Failed to insert message to PostgreSQL');
        }

        console.log('✅ [messageCollection] Message inserted to PostgreSQL:', message.id);
      } catch (error) {
        console.error('❌ [messageCollection] Failed to insert message:', error);
        throw error;
      }
    },

    // Sync message updates to PostgreSQL
    onUpdate: async ({ transaction }) => {
      const { original, changes } = transaction.mutations[0];

      // Skip PostgreSQL sync for streaming messages (too many updates)
      // Streaming messages will be saved once complete via explicit save
      // You can add a 'streaming' or 'finalized' flag to Message type to control this
      // For now, we'll sync all updates (can optimize later)

      console.log('💾 [messageCollection] Updating message in PostgreSQL:', original.id);

      try {
        const res = await fetch(`/api/messages/${original.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        });

        if (!res.ok) {
          throw new Error('Failed to update message in PostgreSQL');
        }

        console.log('✅ [messageCollection] Message updated in PostgreSQL:', original.id);
      } catch (error) {
        console.error('❌ [messageCollection] Failed to update message:', error);
        throw error;
      }
    },

    // Sync message deletions to PostgreSQL
    onDelete: async ({ transaction }) => {
      const { original } = transaction.mutations[0];
      console.log('🗑️  [messageCollection] Deleting message from PostgreSQL:', original.id);

      try {
        const res = await fetch(`/api/messages/${original.id}`, {
          method: 'DELETE',
        });

        if (!res.ok) {
          throw new Error('Failed to delete message from PostgreSQL');
        }

        console.log('✅ [messageCollection] Message deleted from PostgreSQL:', original.id);
      } catch (error) {
        console.error('❌ [messageCollection] Failed to delete message:', error);
        throw error;
      }
    },
  })
);

/**
 * Helper function to upsert a message
 * Handles both insert (if new) and update (if exists) cases
 */
export function upsertMessage(message: Message) {
  const existing = messageCollection.get(message.id);

  if (existing) {
    // Update existing message
    messageCollection.update(message.id, (draft) => {
      Object.assign(draft, message);
    });
  } else {
    // Insert new message
    messageCollection.insert(message);
  }
}
