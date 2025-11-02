import { createCollection, localOnlyCollectionOptions } from '@tanstack/react-db';

/**
 * UI State interface
 * Tracks ephemeral UI state (modals, tabs, views)
 * NOT synced to PostgreSQL - session-only
 */
export interface UIState {
  id: string; // 'global' for app-wide UI state
  activeTab: 'chat' | 'build';
  activeView: 'chat' | 'build';
  showProcessModal: boolean;
  commandPaletteOpen: boolean; // Replaces Zustand useCommandPalette
  renamingProject: { id: string; name: string } | null;
  deletingProject: { id: string; name: string; slug: string } | null;
  selectedTemplate: { id: string; name: string; timestamp?: Date } | null;
}

/**
 * UI State Collection
 *
 * LocalOnlyCollection - ephemeral, no PostgreSQL sync.
 * Manages UI state like modals, tabs, and views.
 *
 * This replaces:
 * - useState for modals (showProcessModal, renamingProject, etc.)
 * - useState for tabs (activeTab, activeView)
 * - Zustand CommandPalette store
 *
 * Benefits:
 * - Unified state management (no scattered useState)
 * - Type-safe updates
 * - Can query UI state (e.g., "is any modal open?")
 *
 * SSR Safe: Only initializes on client side
 */

// Create collection lazily to avoid SSR issues
let _uiStateCollection: any = null;

export const getUIStateCollection = () => {
  if (!_uiStateCollection && typeof window !== 'undefined') {
    _uiStateCollection = createCollection(
      localOnlyCollectionOptions<UIState, string>({
        getKey: (state) => state.id,
        initialData: [
          {
            id: 'global',
            activeTab: 'chat',
            activeView: 'chat',
            showProcessModal: false,
            commandPaletteOpen: false,
            renamingProject: null,
            deletingProject: null,
            selectedTemplate: null,
          },
        ],
      })
    );
  }
  return _uiStateCollection;
};

// Export for convenience (will be null during SSR)
export const uiStateCollection = typeof window !== 'undefined' ? getUIStateCollection() : null as any;

/**
 * Helper functions for common UI state operations
 * All SSR-safe: Skip during server-side rendering
 */

export function openProcessModal() {
  if (typeof window === 'undefined') return;
  getUIStateCollection().update('global', (draft) => {
    draft.showProcessModal = true;
  });
}

export function closeProcessModal() {
  if (typeof window === 'undefined') return;
  getUIStateCollection().update('global', (draft) => {
    draft.showProcessModal = false;
  });
}

export function setActiveTab(tab: 'chat' | 'build') {
  if (typeof window === 'undefined') return;
  getUIStateCollection().update('global', (draft) => {
    draft.activeTab = tab;
  });
}

export function setActiveView(view: 'chat' | 'build') {
  if (typeof window === 'undefined') return;
  getUIStateCollection().update('global', (draft) => {
    draft.activeView = view;
  });
}

export function openCommandPalette() {
  if (typeof window === 'undefined') return;
  getUIStateCollection().update('global', (draft) => {
    draft.commandPaletteOpen = true;
  });
}

export function closeCommandPalette() {
  if (typeof window === 'undefined') return;
  getUIStateCollection().update('global', (draft) => {
    draft.commandPaletteOpen = false;
  });
}

export function toggleCommandPalette() {
  if (typeof window === 'undefined') return;
  getUIStateCollection().update('global', (draft) => {
    draft.commandPaletteOpen = !draft.commandPaletteOpen;
  });
}

export function openRenameModal(project: { id: string; name: string }) {
  if (typeof window === 'undefined') return;
  getUIStateCollection().update('global', (draft) => {
    draft.renamingProject = project;
  });
}

export function closeRenameModal() {
  if (typeof window === 'undefined') return;
  getUIStateCollection().update('global', (draft) => {
    draft.renamingProject = null;
  });
}

export function openDeleteModal(project: { id: string; name: string; slug: string }) {
  if (typeof window === 'undefined') return;
  getUIStateCollection().update('global', (draft) => {
    draft.deletingProject = project;
  });
}

export function closeDeleteModal() {
  if (typeof window === 'undefined') return;
  getUIStateCollection().update('global', (draft) => {
    draft.deletingProject = null;
  });
}

export function setSelectedTemplate(template: { id: string; name: string; timestamp?: Date } | null) {
  if (typeof window === 'undefined') return;
  getUIStateCollection().update('global', (draft) => {
    draft.selectedTemplate = template;
  });
}
