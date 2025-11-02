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
 */
export const uiStateCollection = createCollection(
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

/**
 * Helper functions for common UI state operations
 */

export function openProcessModal() {
  uiStateCollection.update('global', (draft) => {
    draft.showProcessModal = true;
  });
}

export function closeProcessModal() {
  uiStateCollection.update('global', (draft) => {
    draft.showProcessModal = false;
  });
}

export function setActiveTab(tab: 'chat' | 'build') {
  uiStateCollection.update('global', (draft) => {
    draft.activeTab = tab;
  });
}

export function setActiveView(view: 'chat' | 'build') {
  uiStateCollection.update('global', (draft) => {
    draft.activeView = view;
  });
}

export function openCommandPalette() {
  uiStateCollection.update('global', (draft) => {
    draft.commandPaletteOpen = true;
  });
}

export function closeCommandPalette() {
  uiStateCollection.update('global', (draft) => {
    draft.commandPaletteOpen = false;
  });
}

export function toggleCommandPalette() {
  uiStateCollection.update('global', (draft) => {
    draft.commandPaletteOpen = !draft.commandPaletteOpen;
  });
}

export function openRenameModal(project: { id: string; name: string }) {
  uiStateCollection.update('global', (draft) => {
    draft.renamingProject = project;
  });
}

export function closeRenameModal() {
  uiStateCollection.update('global', (draft) => {
    draft.renamingProject = null;
  });
}

export function openDeleteModal(project: { id: string; name: string; slug: string }) {
  uiStateCollection.update('global', (draft) => {
    draft.deletingProject = project;
  });
}

export function closeDeleteModal() {
  uiStateCollection.update('global', (draft) => {
    draft.deletingProject = null;
  });
}

export function setSelectedTemplate(template: { id: string; name: string; timestamp?: Date } | null) {
  uiStateCollection.update('global', (draft) => {
    draft.selectedTemplate = template;
  });
}
