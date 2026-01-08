/**
 * Logging types for the Runner TUI and plain-text output
 */

export type LogLevel = 'debug' | 'info' | 'success' | 'warn' | 'error';

export type LogCategory = 
  | 'system'      // Connection, health checks, startup
  | 'build'       // Build lifecycle events
  | 'tool'        // Tool calls (Read, Write, Edit, Bash, etc.)
  | 'agent'       // Agent messages (Claude thinking, etc.)
  | 'template'    // Template selection, download
  | 'server'      // Dev server, tunnel events
  | 'todo'        // Todo list updates
  | 'orchestrator'; // Build orchestration events

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'high' | 'medium' | 'low';
}

export interface BuildInfo {
  id: string;
  projectId: string;
  projectSlug: string;
  projectName?: string;
  prompt: string;
  operation: string;
  template?: string;
  templateId?: string;
  agent: string;
  model: string;
  startTime: number;
  endTime?: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  todos: TodoItem[];
  toolCallCount: number;
  totalTokens?: number;
  directory?: string;
  error?: string;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  
  // Optional structured data
  data?: Record<string, unknown>;
  
  // Tool-specific fields
  toolName?: string;
  toolArgs?: string; // Truncated args for display
  toolId?: string;
  
  // Build-specific fields
  buildId?: string;
  
  // Whether this is a verbose-only log
  verbose?: boolean;
}

export interface LogFilter {
  levels?: LogLevel[];
  categories?: LogCategory[];
  search?: string;
  buildId?: string;
  verbose?: boolean;
}

export interface BuildCompletionStats {
  elapsedTime: number; // in seconds
  toolCallCount: number;
  totalTokens: number;
  directory: string;
}

// Event types for the logger's event emitter
export interface LoggerEvents {
  log: (entry: LogEntry) => void;
  buildStart: (build: BuildInfo) => void;
  buildUpdate: (build: BuildInfo) => void;
  buildComplete: (build: BuildInfo, stats: BuildCompletionStats) => void;
  todoUpdate: (buildId: string, todos: TodoItem[]) => void;
  connected: () => void;
  disconnected: () => void;
}
