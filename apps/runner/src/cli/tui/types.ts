/**
 * TUI Types and Interfaces
 * Core type definitions for the OpenTUI-based runner interface
 */

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface Todo {
  id: string;
  content: string;
  status: TodoStatus;
  startedAt?: Date;
  completedAt?: Date;
}

export type ToolStatus = 'running' | 'success' | 'error';

export interface ToolAction {
  id: string;
  name: string;
  description: string;
  status: ToolStatus;
  timestamp: Date;
  duration?: number; // ms
  input?: unknown;
  output?: unknown;
  todoIndex?: number;
}

export interface RawLogEntry {
  timestamp: Date;
  service: 'runner' | 'agent' | 'build' | 'system';
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

export type ViewMode = 'activity' | 'todos' | 'raw' | 'help';

export type BuildStatus = 
  | 'idle' 
  | 'connecting' 
  | 'planning' 
  | 'building' 
  | 'completed' 
  | 'failed';

export interface BuildSession {
  id: string;
  projectId: string;
  projectName: string;
  status: BuildStatus;
  startedAt: Date;
  completedAt?: Date;
  prompt?: string;
  summary?: string;
  agentId?: string;
  error?: string;
}

export interface TUIState {
  // Build session
  session: BuildSession | null;
  
  // Task tracking
  todos: Todo[];
  activeTodoIndex: number;
  
  // Tool activity
  actions: ToolAction[];
  currentAction: ToolAction | null;
  
  // Raw logs
  rawLogs: RawLogEntry[];
  
  // UI state
  viewMode: ViewMode;
  isScrolled: boolean;
  scrollOffset: number;
  searchQuery: string;
  isSearching: boolean;
  
  // Connection state
  isConnected: boolean;
  lastEventAt: Date | null;
}

// Color palette for the TUI
export const Colors = {
  // Primary
  primary: '#8B5CF6',      // Purple
  primaryDim: '#6D28D9',
  
  // Status
  success: '#10B981',      // Green
  warning: '#F59E0B',      // Amber
  error: '#EF4444',        // Red
  info: '#3B82F6',         // Blue
  
  // Neutral
  text: '#F9FAFB',         // White
  textDim: '#9CA3AF',      // Gray
  textMuted: '#6B7280',
  
  // Background
  bg: '#111827',           // Dark
  bgPanel: '#1F2937',
  bgHighlight: '#374151',
  
  // Borders
  border: '#374151',
  borderFocus: '#8B5CF6',
  
  // Tool-specific
  toolRead: '#3B82F6',     // Blue
  toolWrite: '#10B981',    // Green
  toolEdit: '#F59E0B',     // Amber
  toolBash: '#EC4899',     // Pink
  toolGlob: '#8B5CF6',     // Purple
  toolGrep: '#06B6D4',     // Cyan
  toolTask: '#F97316',     // Orange
  toolTodo: '#A855F7',     // Violet
} as const;

// Tool icons (using Unicode)
export const ToolIcons: Record<string, string> = {
  Read: '📖',
  Write: '📝',
  Edit: '✏️',
  Bash: '⚡',
  Glob: '🔍',
  Grep: '🔎',
  Task: '🤖',
  TodoWrite: '📋',
  TodoRead: '📋',
  WebFetch: '🌐',
  default: '🔧',
};

// Status icons
export const StatusIcons = {
  pending: '○',
  in_progress: '◐',
  completed: '●',
  failed: '✗',
  running: '→',
  success: '✓',
  error: '✗',
} as const;
