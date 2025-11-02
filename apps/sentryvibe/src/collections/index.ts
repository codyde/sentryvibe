/**
 * TanStack DB Collections
 *
 * Central export for all collections used in SentryVibe.
 *
 * Collections are organized by sync strategy:
 * - QueryCollection: Synced with PostgreSQL via TanStack Query
 * - LocalOnlyCollection: Ephemeral, no PostgreSQL sync
 *
 * SSR Safe: All collections use lazy initialization (only create on client)
 *
 * Import from this file:
 *   import { messageCollection, uiStateCollection } from '@/collections';
 */

// Message collection (synced with PostgreSQL)
export {
  messageCollection,
  getMessageCollection,
  upsertMessage,
} from './messageCollection';

// Generation state collection (synced with PostgreSQL via projects.generationState)
export {
  generationStateCollection,
  getGenerationStateCollection,
  upsertGenerationState,
  type GenerationStateWithId,
} from './generationStateCollection';

// UI state collection (ephemeral, no sync)
export {
  uiStateCollection,
  getUIStateCollection,
  openProcessModal,
  closeProcessModal,
  setActiveTab,
  setActiveView,
  openCommandPalette,
  closeCommandPalette,
  toggleCommandPalette,
  openRenameModal,
  closeRenameModal,
  openDeleteModal,
  closeDeleteModal,
  setSelectedTemplate,
} from './uiStateCollection';

// Re-export types
export type { UIState } from './uiStateCollection';
export type { Message, MessagePart, ElementChange } from '@/types/messages';
export type { GenerationState } from '@/types/generation';
