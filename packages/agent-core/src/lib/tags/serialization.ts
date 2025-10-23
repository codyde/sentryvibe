/**
 * Tag Serialization Helpers
 *
 * Handle serialization/deserialization of tags for database storage
 */

import type { AppliedTag } from '../../types/tags';

export interface SerializedTag {
  key: string;
  value: string;
  expandedValues?: Record<string, string>;
  appliedAt: string; // ISO string
}

/**
 * Serialize tags for database storage (JSONB)
 */
export function serializeTags(tags: AppliedTag[]): SerializedTag[] {
  return tags.map(tag => ({
    key: tag.key,
    value: tag.value,
    expandedValues: tag.expandedValues,
    appliedAt: tag.appliedAt.toISOString()
  }));
}

/**
 * Deserialize tags from database
 */
export function deserializeTags(serializedTags: SerializedTag[] | null | undefined): AppliedTag[] {
  if (!serializedTags || !Array.isArray(serializedTags)) {
    return [];
  }

  return serializedTags.map(tag => ({
    key: tag.key,
    value: tag.value,
    expandedValues: tag.expandedValues,
    appliedAt: new Date(tag.appliedAt)
  }));
}
