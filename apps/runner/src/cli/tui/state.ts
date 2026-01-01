/**
 * TUI State Manager
 * Centralized state management for the OpenTUI runner interface
 * Uses an event emitter pattern for reactive updates
 */

import { EventEmitter } from 'events';
import type {
  TUIState,
  Todo,
  ToolAction,
  RawLogEntry,
  ViewMode,
  BuildStatus,
  BuildSession,
  TodoStatus,
  ToolStatus,
} from './types.js';
import { ToolIcons } from './types.js';

export interface TUIStateEvents {
  'state-changed': (state: TUIState) => void;
  'todos-updated': (todos: Todo[]) => void;
  'action-started': (action: ToolAction) => void;
  'action-completed': (action: ToolAction) => void;
  'build-status-changed': (status: BuildStatus) => void;
  'log-added': (log: RawLogEntry) => void;
}

const MAX_ACTIONS = 500;
const MAX_LOGS = 2000;

function createInitialState(): TUIState {
  return {
    session: null,
    todos: [],
    activeTodoIndex: -1,
    actions: [],
    currentAction: null,
    rawLogs: [],
    viewMode: 'activity',
    isScrolled: false,
    scrollOffset: 0,
    searchQuery: '',
    isSearching: false,
    isConnected: false,
    lastEventAt: null,
  };
}

export class TUIStateManager extends EventEmitter {
  private state: TUIState;

  constructor() {
    super();
    this.state = createInitialState();
  }

  getState(): TUIState {
    return { ...this.state };
  }

  // Session management
  startSession(params: {
    id: string;
    projectId: string;
    projectName: string;
    prompt?: string;
    agentId?: string;
  }) {
    this.state.session = {
      id: params.id,
      projectId: params.projectId,
      projectName: params.projectName,
      status: 'connecting',
      startedAt: new Date(),
      prompt: params.prompt,
      agentId: params.agentId,
    };
    this.state.todos = [];
    this.state.activeTodoIndex = -1;
    this.state.actions = [];
    this.state.currentAction = null;
    this.emit('state-changed', this.state);
    this.emit('build-status-changed', 'connecting');
  }

  updateSessionStatus(status: BuildStatus, error?: string, summary?: string) {
    if (!this.state.session) return;
    
    this.state.session.status = status;
    if (error) this.state.session.error = error;
    if (summary) this.state.session.summary = summary;
    if (status === 'completed' || status === 'failed') {
      this.state.session.completedAt = new Date();
      this.state.currentAction = null;
    }
    
    this.emit('state-changed', this.state);
    this.emit('build-status-changed', status);
  }

  // Todo management
  updateTodos(todos: Array<{ content: string; status: string; id?: string }>, activeTodoIndex?: number) {
    this.state.todos = todos.map((t, i) => ({
      id: t.id || `todo-${i}`,
      content: t.content,
      status: t.status as TodoStatus,
      startedAt: t.status === 'in_progress' ? new Date() : undefined,
      completedAt: t.status === 'completed' ? new Date() : undefined,
    }));
    
    if (activeTodoIndex !== undefined) {
      this.state.activeTodoIndex = activeTodoIndex;
    } else {
      // Find the first in_progress todo
      const activeIdx = this.state.todos.findIndex(t => t.status === 'in_progress');
      this.state.activeTodoIndex = activeIdx >= 0 ? activeIdx : -1;
    }
    
    // Update session status if we have todos
    if (this.state.session && this.state.session.status === 'connecting') {
      this.state.session.status = 'planning';
    }
    
    this.emit('state-changed', this.state);
    this.emit('todos-updated', this.state.todos);
  }

  completeTodo(index: number) {
    if (index >= 0 && index < this.state.todos.length) {
      this.state.todos[index].status = 'completed';
      this.state.todos[index].completedAt = new Date();
      this.emit('state-changed', this.state);
      this.emit('todos-updated', this.state.todos);
    }
  }

  // Tool action management
  startAction(params: {
    id: string;
    name: string;
    input?: unknown;
    todoIndex?: number;
  }) {
    const description = this.formatToolDescription(params.name, params.input);
    
    const action: ToolAction = {
      id: params.id,
      name: params.name,
      description,
      status: 'running',
      timestamp: new Date(),
      input: params.input,
      todoIndex: params.todoIndex,
    };
    
    this.state.currentAction = action;
    this.state.actions.unshift(action);
    
    // Trim actions list
    if (this.state.actions.length > MAX_ACTIONS) {
      this.state.actions = this.state.actions.slice(0, MAX_ACTIONS);
    }
    
    // Update session status
    if (this.state.session && this.state.session.status !== 'building') {
      this.state.session.status = 'building';
    }
    
    this.state.lastEventAt = new Date();
    this.emit('state-changed', this.state);
    this.emit('action-started', action);
    
    // Add to raw logs
    this.addLog({
      service: 'agent',
      level: 'info',
      message: `${ToolIcons[params.name] || ToolIcons.default} ${params.name}: ${description}`,
    });
  }

  completeAction(id: string, output?: unknown, status: ToolStatus = 'success') {
    const action = this.state.actions.find(a => a.id === id);
    if (action) {
      action.status = status;
      action.output = output;
      action.duration = Date.now() - action.timestamp.getTime();
      
      if (this.state.currentAction?.id === id) {
        this.state.currentAction = null;
      }
      
      this.state.lastEventAt = new Date();
      this.emit('state-changed', this.state);
      this.emit('action-completed', action);
    }
  }

  // Raw log management
  addLog(params: Omit<RawLogEntry, 'timestamp'>) {
    const log: RawLogEntry = {
      ...params,
      timestamp: new Date(),
    };
    
    this.state.rawLogs.unshift(log);
    
    // Trim logs
    if (this.state.rawLogs.length > MAX_LOGS) {
      this.state.rawLogs = this.state.rawLogs.slice(0, MAX_LOGS);
    }
    
    this.emit('log-added', log);
  }

  // UI state management
  setViewMode(mode: ViewMode) {
    this.state.viewMode = mode;
    this.state.scrollOffset = 0;
    this.state.isScrolled = false;
    this.emit('state-changed', this.state);
  }

  setSearchQuery(query: string) {
    this.state.searchQuery = query;
    this.emit('state-changed', this.state);
  }

  setSearching(isSearching: boolean) {
    this.state.isSearching = isSearching;
    if (!isSearching) {
      this.state.searchQuery = '';
    }
    this.emit('state-changed', this.state);
  }

  scrollUp(amount = 1) {
    this.state.scrollOffset = Math.max(0, this.state.scrollOffset + amount);
    this.state.isScrolled = this.state.scrollOffset > 0;
    this.emit('state-changed', this.state);
  }

  scrollDown(amount = 1) {
    this.state.scrollOffset = Math.max(0, this.state.scrollOffset - amount);
    this.state.isScrolled = this.state.scrollOffset > 0;
    this.emit('state-changed', this.state);
  }

  scrollToTop() {
    // In our inverted list, "top" means oldest = highest offset
    const maxOffset = this.state.viewMode === 'raw' 
      ? this.state.rawLogs.length 
      : this.state.actions.length;
    this.state.scrollOffset = maxOffset;
    this.state.isScrolled = true;
    this.emit('state-changed', this.state);
  }

  scrollToBottom() {
    this.state.scrollOffset = 0;
    this.state.isScrolled = false;
    this.emit('state-changed', this.state);
  }

  setConnected(connected: boolean) {
    this.state.isConnected = connected;
    this.emit('state-changed', this.state);
  }

  reset() {
    this.state = createInitialState();
    this.emit('state-changed', this.state);
  }

  // Helper to format tool descriptions
  private formatToolDescription(name: string, input?: unknown): string {
    if (!input) return '';
    
    const inp = input as Record<string, unknown>;
    
    switch (name) {
      case 'Read':
        return this.truncatePath(inp.filePath as string);
      case 'Write':
        return this.truncatePath(inp.filePath as string);
      case 'Edit':
        return this.truncatePath(inp.filePath as string);
      case 'Bash':
        return this.truncateCommand(inp.command as string);
      case 'Glob':
        return inp.pattern as string || '';
      case 'Grep':
        return `"${inp.pattern}" in ${inp.include || '*'}`;
      case 'Task':
        return inp.description as string || '';
      case 'TodoWrite':
        const todos = inp.todos as Array<{ content: string }>;
        return `${todos?.length || 0} tasks`;
      case 'WebFetch':
        return this.truncateUrl(inp.url as string);
      default:
        return '';
    }
  }

  private truncatePath(path: string | undefined): string {
    if (!path) return '';
    // Show just the filename or last 2 path segments
    const parts = path.split('/');
    if (parts.length <= 2) return path;
    return '.../' + parts.slice(-2).join('/');
  }

  private truncateCommand(cmd: string | undefined): string {
    if (!cmd) return '';
    // First line only, truncated
    const firstLine = cmd.split('\n')[0];
    return firstLine.length > 50 ? firstLine.slice(0, 47) + '...' : firstLine;
  }

  private truncateUrl(url: string | undefined): string {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      return parsed.hostname + (parsed.pathname.length > 20 
        ? parsed.pathname.slice(0, 17) + '...' 
        : parsed.pathname);
    } catch {
      return url.slice(0, 40);
    }
  }
}

// Singleton instance
let instance: TUIStateManager | null = null;

export function getTUIStateManager(): TUIStateManager {
  if (!instance) {
    instance = new TUIStateManager();
  }
  return instance;
}

export function resetTUIStateManager(): void {
  if (instance) {
    instance.reset();
  }
}
