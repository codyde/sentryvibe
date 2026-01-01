/**
 * ANSI-based TUI Renderer
 * A simple, stable terminal renderer using ANSI escape codes
 * No external dependencies beyond Node.js built-ins
 */

import { EventEmitter } from 'events';
import { getTUIStateManager, type TUIStateManager } from './state.js';
import type { TUIState, ViewMode, Todo, ToolAction, RawLogEntry } from './types.js';
import { Colors, ToolIcons, StatusIcons } from './types.js';
import readline from 'readline';

// ANSI escape codes
const ESC = '\x1b';
const CSI = `${ESC}[`;

const ansi = {
  // Cursor control
  hideCursor: `${CSI}?25l`,
  showCursor: `${CSI}?25h`,
  moveTo: (row: number, col: number) => `${CSI}${row};${col}H`,
  clearScreen: `${CSI}2J`,
  clearLine: `${CSI}2K`,
  
  // Colors (using 24-bit colors)
  fg: (hex: string) => {
    const [r, g, b] = hexToRgb(hex);
    return `${CSI}38;2;${r};${g};${b}m`;
  },
  bg: (hex: string) => {
    const [r, g, b] = hexToRgb(hex);
    return `${CSI}48;2;${r};${g};${b}m`;
  },
  reset: `${CSI}0m`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
};

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16),
    ];
  }
  return [255, 255, 255]; // Default to white
}

export interface ANSIRendererOptions {
  onQuit?: () => void;
}

export class ANSIRenderer extends EventEmitter {
  private stateManager: TUIStateManager;
  private options: ANSIRendererOptions;
  private isRunning = false;
  private rl: readline.Interface | null = null;
  private renderInterval: NodeJS.Timeout | null = null;
  private lastRender = '';

  constructor(options: ANSIRendererOptions = {}) {
    super();
    this.options = options;
    this.stateManager = getTUIStateManager();
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    
    // Hide cursor and clear screen
    process.stdout.write(ansi.hideCursor);
    process.stdout.write(ansi.clearScreen);
    process.stdout.write(ansi.moveTo(1, 1));

    // Setup keyboard input
    this.setupKeyboardInput();
    
    // Setup state listener
    this.stateManager.on('state-changed', () => this.render());
    
    // Initial render
    this.render();
    
    // Periodic render for time updates
    this.renderInterval = setInterval(() => this.render(), 1000);
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    
    if (this.renderInterval) {
      clearInterval(this.renderInterval);
      this.renderInterval = null;
    }
    
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    // Show cursor and reset terminal
    process.stdout.write(ansi.showCursor);
    process.stdout.write(ansi.reset);
    process.stdout.write(ansi.clearScreen);
    process.stdout.write(ansi.moveTo(1, 1));
  }

  private setupKeyboardInput(): void {
    // Enable raw mode for immediate key handling
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    process.stdin.on('data', (data) => {
      const key = data.toString();
      this.handleKey(key);
    });
  }

  private handleKey(key: string): void {
    const state = this.stateManager.getState();

    // Handle search mode
    if (state.isSearching) {
      if (key === '\x1b' || key === '\r') { // Escape or Enter
        this.stateManager.setSearching(false);
      } else if (key === '\x7f') { // Backspace
        const query = state.searchQuery;
        this.stateManager.setSearchQuery(query.slice(0, -1));
      } else if (key.length === 1 && key >= ' ') {
        this.stateManager.setSearchQuery(state.searchQuery + key);
      }
      return;
    }

    // Global shortcuts
    switch (key) {
      case 'q':
      case '\x03': // Ctrl+C
        this.handleQuit();
        break;
      case 'a':
        this.stateManager.setViewMode('activity');
        break;
      case 't':
        this.stateManager.setViewMode('todos');
        break;
      case 'r':
        this.stateManager.setViewMode('raw');
        break;
      case '?':
        this.stateManager.setViewMode('help');
        break;
      case '\x1b': // Escape
        if (state.viewMode === 'help') {
          this.stateManager.setViewMode('activity');
        }
        break;
      case '/':
        this.stateManager.setSearching(true);
        break;
      case 'k':
      case '\x1b[A': // Up arrow
        this.stateManager.scrollUp();
        break;
      case 'j':
      case '\x1b[B': // Down arrow
        this.stateManager.scrollDown();
        break;
      case 'g':
        this.stateManager.scrollToTop();
        break;
      case 'G':
        this.stateManager.scrollToBottom();
        break;
    }
  }

  private handleQuit(): void {
    this.stop();
    this.options.onQuit?.();
  }

  private render(): void {
    if (!this.isRunning) return;

    const state = this.stateManager.getState();
    const { columns: width = 80, rows: height = 24 } = process.stdout;
    
    const lines: string[] = [];

    // Header
    lines.push(...this.renderHeader(state, width));
    
    // Content based on view mode
    const contentHeight = height - 6; // Reserve for header and footer
    switch (state.viewMode) {
      case 'help':
        lines.push(...this.renderHelp(width, contentHeight));
        break;
      case 'todos':
        lines.push(...this.renderTodos(state, width, contentHeight));
        break;
      case 'raw':
        lines.push(...this.renderRawLogs(state, width, contentHeight));
        break;
      case 'activity':
      default:
        lines.push(...this.renderActivity(state, width, contentHeight));
        break;
    }
    
    // Pad to fill screen
    while (lines.length < height - 2) {
      lines.push('');
    }
    
    // Footer
    lines.push(...this.renderFooter(state, width));

    // Build output
    const output = lines.map(line => {
      // Truncate or pad lines to width
      const visible = this.stripAnsi(line);
      if (visible.length > width) {
        return line.substring(0, width - 3) + '...';
      }
      return line + ' '.repeat(Math.max(0, width - visible.length));
    }).join('\n');

    // Only update if changed
    if (output !== this.lastRender) {
      this.lastRender = output;
      process.stdout.write(ansi.moveTo(1, 1));
      process.stdout.write(output);
    }
  }

  private stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }

  private renderHeader(state: TUIState, width: number): string[] {
    const lines: string[] = [];
    
    // Title row
    const logo = `${ansi.fg(Colors.primary)}${ansi.bold} SentryVibe Runner${ansi.reset}`;
    const connText = state.isConnected ? '● Connected' : '○ Disconnected';
    const connColor = state.isConnected ? Colors.success : Colors.error;
    const connection = `${ansi.fg(connColor)}${connText}${ansi.reset}`;
    
    const titleLeft = ' SentryVibe Runner';
    const padding = Math.max(0, width - titleLeft.length - connText.length - 2);
    lines.push(`${logo}${' '.repeat(padding)}${connection}`);

    // Session info
    if (state.session) {
      const statusColors: Record<string, string> = {
        idle: Colors.textDim,
        connecting: Colors.warning,
        planning: Colors.info,
        building: Colors.primary,
        completed: Colors.success,
        failed: Colors.error,
      };
      const statusColor = statusColors[state.session.status] || Colors.textDim;
      const statusText = `${ansi.fg(statusColor)}[${state.session.status.toUpperCase()}]${ansi.reset}`;
      lines.push(`${ansi.fg(Colors.text)}Project: ${state.session.projectName}${ansi.reset} ${statusText}`);
    } else {
      lines.push(`${ansi.fg(Colors.textDim)}Waiting for build...${ansi.reset}`);
    }

    // Separator
    lines.push(`${ansi.fg(Colors.border)}${'─'.repeat(width)}${ansi.reset}`);

    return lines;
  }

  private renderActivity(state: TUIState, width: number, maxLines: number): string[] {
    const lines: string[] = [];

    // Current action highlight
    if (state.currentAction) {
      const icon = ToolIcons[state.currentAction.name] || ToolIcons.default;
      lines.push(`${ansi.fg(Colors.primary)}┌${'─'.repeat(width - 2)}┐${ansi.reset}`);
      lines.push(`${ansi.fg(Colors.primary)}│${ansi.reset} ${icon} ${ansi.fg(Colors.text)}${state.currentAction.name}:${ansi.reset} ${state.currentAction.description}`);
      lines.push(`${ansi.fg(Colors.primary)}└${'─'.repeat(width - 2)}┘${ansi.reset}`);
      lines.push('');
    }

    // Activity title
    lines.push(`${ansi.fg(Colors.primary)}${ansi.bold}ACTIVITY${ansi.reset}`);
    lines.push('');

    // Activity items
    const actions = state.actions.slice(state.scrollOffset, state.scrollOffset + maxLines - lines.length);
    
    if (actions.length === 0) {
      lines.push(`${ansi.fg(Colors.textDim)}No activity yet...${ansi.reset}`);
    } else {
      for (const action of actions) {
        const icon = ToolIcons[action.name] || ToolIcons.default;
        const statusIcon = StatusIcons[action.status] || StatusIcons.pending;
        const time = action.timestamp.toLocaleTimeString('en-US', { hour12: false });
        const duration = action.duration ? ` (${action.duration}ms)` : '';
        
        const statusColor = action.status === 'success' ? Colors.success 
          : action.status === 'error' ? Colors.error 
          : Colors.warning;

        lines.push(
          `${ansi.fg(Colors.textMuted)}${time}${ansi.reset} ` +
          `${ansi.fg(statusColor)}${statusIcon}${ansi.reset} ` +
          `${icon} ${ansi.fg(Colors.text)}${action.name}:${ansi.reset} ${action.description}${ansi.fg(Colors.textDim)}${duration}${ansi.reset}`
        );
      }
    }

    return lines;
  }

  private renderTodos(state: TUIState, width: number, maxLines: number): string[] {
    const lines: string[] = [];

    // Progress stats
    const completed = state.todos.filter(t => t.status === 'completed').length;
    const total = state.todos.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Title with progress
    lines.push(`${ansi.fg(Colors.primary)}${ansi.bold}TASKS${ansi.reset} ${ansi.fg(Colors.textDim)}[${completed}/${total}] ${percentage}%${ansi.reset}`);
    lines.push('');

    // Progress bar
    const barWidth = Math.min(40, width - 4);
    const filled = Math.round((percentage / 100) * barWidth);
    const progressBar = `${ansi.fg(Colors.success)}[${'█'.repeat(filled)}${ansi.fg(Colors.textDim)}${'░'.repeat(barWidth - filled)}${ansi.fg(Colors.success)}]${ansi.reset}`;
    lines.push(progressBar);
    lines.push('');

    // Todo items
    if (state.todos.length === 0) {
      lines.push(`${ansi.fg(Colors.textDim)}No tasks yet...${ansi.reset}`);
    } else {
      for (let i = 0; i < state.todos.length && lines.length < maxLines; i++) {
        const todo = state.todos[i];
        const isActive = i === state.activeTodoIndex;
        const statusIcon = StatusIcons[todo.status] || StatusIcons.pending;
        
        const statusColor = todo.status === 'completed' ? Colors.success 
          : todo.status === 'in_progress' ? Colors.primary 
          : todo.status === 'failed' ? Colors.error 
          : Colors.textDim;

        const prefix = isActive ? `${ansi.fg(Colors.primary)}→${ansi.reset}` : ' ';
        const icon = `${ansi.fg(statusColor)}${statusIcon}${ansi.reset}`;
        const content = isActive 
          ? `${ansi.fg(Colors.text)}${todo.content}${ansi.reset}`
          : `${ansi.fg(Colors.textDim)}${todo.content}${ansi.reset}`;

        lines.push(`${prefix} ${icon} ${content}`);
      }
    }

    return lines;
  }

  private renderRawLogs(state: TUIState, width: number, maxLines: number): string[] {
    const lines: string[] = [];

    lines.push(`${ansi.fg(Colors.primary)}${ansi.bold}RAW LOGS${ansi.reset}`);
    lines.push('');

    const logs = state.rawLogs.slice(state.scrollOffset, state.scrollOffset + maxLines - 2);

    if (logs.length === 0) {
      lines.push(`${ansi.fg(Colors.textDim)}No logs yet...${ansi.reset}`);
    } else {
      for (const log of logs) {
        const time = log.timestamp.toLocaleTimeString('en-US', { hour12: false });
        const levelColors: Record<string, string> = {
          info: Colors.info,
          warn: Colors.warning,
          error: Colors.error,
          debug: Colors.textDim,
        };
        const levelColor = levelColors[log.level] || Colors.textDim;
        
        lines.push(
          `${ansi.fg(Colors.textMuted)}${time}${ansi.reset} ` +
          `${ansi.fg(levelColor)}[${log.level.toUpperCase()}]${ansi.reset} ` +
          `${ansi.fg(Colors.text)}${log.message}${ansi.reset}`
        );
      }
    }

    return lines;
  }

  private renderHelp(width: number, maxLines: number): string[] {
    const lines: string[] = [];

    lines.push(`${ansi.fg(Colors.primary)}${ansi.bold}KEYBOARD SHORTCUTS${ansi.reset}`);
    lines.push('');
    
    const shortcuts = [
      ['a', 'Activity view'],
      ['t', 'Tasks view'],
      ['r', 'Raw logs view'],
      ['?', 'Help'],
      ['/', 'Search'],
      ['↑/k', 'Scroll up'],
      ['↓/j', 'Scroll down'],
      ['g', 'Scroll to top'],
      ['G', 'Scroll to bottom'],
      ['Esc', 'Back / Cancel'],
      ['q', 'Quit'],
    ];

    for (const [key, desc] of shortcuts) {
      lines.push(
        `  ${ansi.fg(Colors.primary)}[${key}]${ansi.reset} ` +
        `${ansi.fg(Colors.text)}${desc}${ansi.reset}`
      );
    }

    lines.push('');
    lines.push(`${ansi.fg(Colors.textDim)}Press Esc to go back${ansi.reset}`);

    return lines;
  }

  private renderFooter(state: TUIState, width: number): string[] {
    const lines: string[] = [];

    // Separator
    lines.push(`${ansi.fg(Colors.border)}${'─'.repeat(width)}${ansi.reset}`);

    // Search input or shortcuts
    if (state.isSearching) {
      lines.push(
        `${ansi.fg(Colors.primary)}/${ansi.reset} ` +
        `${ansi.fg(Colors.text)}${state.searchQuery}█${ansi.reset} ` +
        `${ansi.fg(Colors.textMuted)}(Enter to search, Esc to cancel)${ansi.reset}`
      );
    } else {
      const shortcuts = this.getShortcutsForView(state.viewMode);
      lines.push(`${ansi.fg(Colors.textDim)}${shortcuts}${ansi.reset}`);
    }

    return lines;
  }

  private getShortcutsForView(viewMode: ViewMode): string {
    const common = '[q] quit';
    
    switch (viewMode) {
      case 'activity':
        return `[t] todos  [r] raw  [/] search  [↑↓] scroll  [?] help  ${common}`;
      case 'todos':
        return `[a] activity  [r] raw  [↑↓] scroll  [?] help  ${common}`;
      case 'raw':
        return `[a] activity  [t] todos  [/] search  [↑↓] scroll  [?] help  ${common}`;
      case 'help':
        return `[Esc] back  ${common}`;
      default:
        return common;
    }
  }
}

// Factory function
export async function createANSIRenderer(options?: ANSIRendererOptions): Promise<ANSIRenderer> {
  const renderer = new ANSIRenderer(options);
  await renderer.start();
  return renderer;
}
