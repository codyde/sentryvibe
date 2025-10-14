/**
 * Build operation types
 * Defines the semantic intent of each build request
 */
import type { AgentId } from './agent';

export type BuildOperationType =
  | 'initial-build'      // First time build, needs template download
  | 'enhancement'        // Follow-up chat for significant changes
  | 'focused-edit'       // Element selector or small targeted changes
  | 'continuation';      // Retry or continue a failed build

/**
 * Build request payload
 */
export interface BuildRequest {
  operationType: BuildOperationType;
  prompt: string;
  runnerId?: string; // Optional runner ID - falls back to RUNNER_DEFAULT_ID
  buildId?: string;
  agent?: AgentId; // Selected coding agent provider (Claude Code, OpenAI Codex, etc.)
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
export type BuildEventType =
  // Lifecycle events
  | 'build-start'
  | 'build-complete'
  | 'build-error'

  // Pre-build events (initial-build only)
  | 'pre-build-start'
  | 'metadata-extracted'
  | 'template-selected'
  | 'template-downloaded'

  // Progress events
  | 'todo-update'
  | 'tool-start'
  | 'tool-output'
  | 'text-chunk'

  // Context events
  | 'reasoning';

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
