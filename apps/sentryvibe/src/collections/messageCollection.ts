import { createCollection } from '@tanstack/react-db';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import type { Message } from '@/types/messages';

// Lazy import queryClient to avoid SSR issues
let _queryClient: any = null;
const getQueryClient = () => {
  if (!_queryClient && typeof window !== 'undefined') {
    // Only import on client side
    _queryClient = require('@/app/providers').queryClient;
  }
  return _queryClient;
};

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
 *
 * SSR Safe: Only initializes on client side
 */

// Create collection lazily to avoid SSR issues
let _messageCollection: any = null;

export const getMessageCollection = () => {
  if (!_messageCollection && typeof window !== 'undefined') {
    // TEMPORARY: Using localOnlyCollectionOptions instead of queryCollectionOptions
    // because /api/messages endpoint doesn't exist yet
    // Messages currently stored per-project in /api/projects/[id]/messages
    // TODO: Either create /api/messages endpoints or adapt to use per-project endpoints

    const { localOnlyCollectionOptions } = require('@tanstack/react-db');

    _messageCollection = createCollection(
      localOnlyCollectionOptions<Message, string>({
        getKey: (message) => message.id,

        // TEMPORARY: No sync handlers - /api/messages endpoint doesn't exist
        // Collection works as in-memory store
        // Messages will be lost on refresh (acceptable for testing reactivity)
        // TODO: Create /api/messages endpoints or adapt to use /api/projects/[id]/messages
      })
    );
  }
  return _messageCollection;
};

// Export for convenience (will be null during SSR)
export const messageCollection = typeof window !== 'undefined' ? getMessageCollection() : null as any;

/**
 * Helper function to upsert a message
 * Handles both insert (if new) and update (if exists) cases
 * SSR Safe: Only runs on client
 */
export function upsertMessage(message: Message) {
  if (typeof window === 'undefined') return; // Skip during SSR

  const collection = getMessageCollection();
  const existing = collection.get(message.id);

  if (existing) {
    // Update existing message
    collection.update(message.id, (draft) => {
      Object.assign(draft, message);
    });
  } else {
    // Insert new message
    collection.insert(message);
  }
}
