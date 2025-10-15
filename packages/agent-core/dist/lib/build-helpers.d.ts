import type { BuildOperationType } from '@/types/build';
import type { AgentId } from '@/types/agent';
import type { CodexSessionState, GenerationState } from '@/types/generation';
import type { ProjectSummary } from '@/types/project';
/**
 * Detect the appropriate build operation type based on context
 */
export declare function detectOperationType(params: {
    project: ProjectSummary;
    isElementChange?: boolean;
    isRetry?: boolean;
}): BuildOperationType;
/**
 * Detect operation type from project status
 */
export declare function isNewProject(project: ProjectSummary): boolean;
/**
 * Create a fresh generation state for a new build
 */
export declare function createFreshGenerationState(params: {
    projectId: string;
    projectName: string;
    operationType: BuildOperationType;
    agentId?: AgentId;
}): GenerationState;
/**
 * Validate generation state before using it
 */
export declare function validateGenerationState(state: any): boolean;
export declare function createInitialCodexSessionState(): CodexSessionState;
