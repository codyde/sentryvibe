import { createCollection, localOnlyCollectionOptions } from '@tanstack/react-db';
import type { GenerationState } from '@/types/generation';

/**
 * Generation State Collection
 *
 * Syncs with PostgreSQL projects.generationState JSONB field.
 * Tracks active builds, todos, summaries, and agent state per project.
 *
 * Sync Strategy:
 * - Load: Manually populated from WebSocket (not via queryCollectionOptions)
 * - Update: Collection (instant UI) → onUpdate → PATCH /api/projects/[id] (async)
 *
 * Note: Generation state is stored as JSONB in the projects table,
 * so we sync by PATCH-ing the project with the new generationState field.
 *
 * This is a LocalOnlyCollection because data comes from WebSocket, not REST.
 * We use onUpdate handler to sync changes back to PostgreSQL.
 */

// Extended type to include ID for collection key
export type GenerationStateWithId = GenerationState & { id: string };

export const generationStateCollection = createCollection(
  localOnlyCollectionOptions<GenerationStateWithId, string>({
    getKey: (state) => state.id,

    // Sync updates to PostgreSQL (stored in projects.generationState JSONB)
    onUpdate: async ({ transaction }) => {
      const { original } = transaction.mutations[0];
      const projectId = original.id;

      console.log('💾 [generationStateCollection] Updating generation state in PostgreSQL:', projectId);

      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            generationState: original,
          }),
        });

        if (!res.ok) {
          throw new Error('Failed to update generation state in PostgreSQL');
        }

        console.log('✅ [generationStateCollection] Generation state updated in PostgreSQL:', projectId);
      } catch (error) {
        console.error('❌ [generationStateCollection] Failed to update generation state:', error);
        throw error;
      }
    },
  })
);

/**
 * Helper function to upsert generation state
 */
export function upsertGenerationState(projectId: string, state: GenerationState) {
  const existing = generationStateCollection.get(projectId);

  if (existing) {
    generationStateCollection.update(projectId, () => ({ ...state, id: projectId }));
  } else {
    generationStateCollection.insert({ ...state, id: projectId });
  }
}
