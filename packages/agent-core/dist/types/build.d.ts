/**
 * Build operation types
 * Defines the semantic intent of each build request
 */
import type { AgentId } from './agent';
export type BuildOperationType = 'initial-build' | 'enhancement' | 'focused-edit' | 'continuation';
/**
 * Build request payload
 */
export interface BuildRequest {
    operationType: BuildOperationType;
    prompt: string;
    runnerId?: string;
    buildId?: string;
    agent?: AgentId;
    context?: {
        elementSelector?: string;
        elementInfo?: {
            tagName?: string;
            className?: string;
            textContent?: string;
            [key: string]: any;
        };
        previousBuildId?: string;
    };
}
/**
 * Build event types for streaming
 */
export type BuildEventType = 'build-start' | 'build-complete' | 'build-error' | 'pre-build-start' | 'metadata-extracted' | 'template-selected' | 'template-downloaded' | 'todo-update' | 'tool-start' | 'tool-output' | 'text-chunk' | 'reasoning';
/**
 * Build event payload
 */
export interface BuildEvent {
    type: BuildEventType;
    buildId: string;
    timestamp: number;
    data?: any;
}
/**
 * Build statistics
 */
export interface BuildStats {
    duration: number;
    filesCreated?: number;
    filesModified?: number;
    packagesInstalled?: number;
    errors?: number;
}
/**
 * Enhanced GenerationState with build type
 */
export interface EnhancedGenerationState {
    id: string;
    projectId: string;
    projectName: string;
    operationType: BuildOperationType;
    todos: any[];
    toolsByTodo: Record<number, any[]>;
    textByTodo: Record<number, any[]>;
    activeTodoIndex: number;
    isActive: boolean;
    startTime: Date;
    endTime?: Date;
    stats?: BuildStats;
}
