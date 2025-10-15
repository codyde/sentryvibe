import type { GenerationState } from '@/types/generation';
/**
 * Serialize GenerationState for database storage
 * Converts Date objects to ISO strings
 */
export declare function serializeGenerationState(state: GenerationState): string;
/**
 * Deserialize GenerationState from database
 * Converts ISO strings back to Date objects
 */
export declare function deserializeGenerationState(json: string | null): GenerationState | null;
/**
 * Save generationState to database
 */
export declare function saveGenerationState(projectId: string, state: GenerationState): Promise<boolean>;
