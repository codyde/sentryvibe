import { createCollection } from '@tanstack/react-db';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { queryClient } from '@/app/providers';
import type { Message } from '@/types/messages';

/**
 * Message Collection
 *
 * Following TanStack DB docs pattern exactly:
 * - Create collection at module level (like docs example)
 * - No typeof window checks (module only loads in client component)
 * - This file imported only in ChatInterface (ssr: false), so always client-side
 *
 * Sync Strategy:
 * - Load: PostgreSQL → TanStack Query → Collection (queryFn)
 * - Insert: Collection → onInsert → PostgreSQL
 * - Update: Collection → onUpdate → PostgreSQL
 * - Delete: Collection → onDelete → PostgreSQL
 */

export const messageCollection = createCollection(
  queryCollectionOptions<Message, string>({
    queryClient,
    queryKey: ['messages'],
    queryFn: async () => {
      const res = await fetch('/api/messages');
      if (!res.ok) {
        console.error('❌ [messageCollection] Fetch failed:', res.status);
        throw new Error(`Failed to fetch messages: ${res.status}`);
      }

      const data = await res.json();
      return data.messages || [];
    },
    getKey: (message) => message.id,

    // Sync new messages to PostgreSQL
    onInsert: async ({ transaction }) => {
      const { changes: message } = transaction.mutations[0];

      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      if (!res.ok) {
        console.error('❌ [messageCollection] Insert failed:', message.id, res.status);
        throw new Error('Failed to insert message');
      }
    },

    // Sync updates to PostgreSQL
    onUpdate: async ({ transaction }) => {
      const { original, changes } = transaction.mutations[0];

      const res = await fetch(`/api/messages/${original.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });

      if (!res.ok) {
        console.error('❌ [messageCollection] Update failed:', original.id, res.status);
        throw new Error('Failed to update message');
      }
    },

    // Sync deletions to PostgreSQL
    onDelete: async ({ transaction }) => {
      const { original } = transaction.mutations[0];

      const res = await fetch(`/api/messages/${original.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        console.error('❌ [messageCollection] Delete failed:', original.id, res.status);
        throw new Error('Failed to delete message');
      }
    },
  })
);

console.log('✅ [messageCollection] Initialized');

/**
 * Helper: Upsert a message (insert if new, update if exists)
 */
export function upsertMessage(message: Message) {
  const existing = messageCollection.get(message.id);

  if (existing) {
    messageCollection.update(message.id, (draft) => {
      Object.assign(draft, message);
    });
  } else {
    messageCollection.insert(message);
  }
}
