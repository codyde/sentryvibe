/**
 * ANSI-based TUI Renderer
 * A simple, stable terminal renderer using ANSI escape codes
 * Split-column layout: Todos (1/5 left) | Activity (4/5 right)
 */

import { EventEmitter } from 'events';
import { getTUIStateManager, type TUIStateManager } from './state.js';
import type { TUIState, ViewMode } from './types.js';
import { Colors, ToolIcons, StatusIcons } from './types.js';

// Store original console and stdout methods for restoration
const originalConsole = {
  log: console.log.bind(console),
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
};

const originalStdout = {
  write: process.stdout.write.bind(process.stdout),
};

const originalStderr = {
  write: process.stderr.write.bind(process.stderr),
};

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

// ASCII Art Banner for SentryVibe Runner
const BANNER_LINES = [
  '███████╗███████╗███╗   ██╗████████╗██████╗ ██╗   ██╗██╗   ██╗██╗██████╗ ███████╗',
  '██╔════╝██╔════╝████╗  ██║╚══██╔══╝██╔══██╗╚██╗ ██╔╝██║   ██║██║██╔══██╗██╔════╝',
  '███████╗█████╗  ██╔██╗ ██║   ██║   ██████╔╝ ╚████╔╝ ██║   ██║██║██████╔╝█████╗  ',
  '╚════██║██╔══╝  ██║╚██╗██║   ██║   ██╔══██╗  ╚██╔╝  ╚██╗ ██╔╝██║██╔══██╗██╔══╝  ',
  '███████║███████╗██║ ╚████║   ██║   ██║  ██║   ██║    ╚████╔╝ ██║██████╔╝███████╗',
  '╚══════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝     ╚═══╝  ╚═╝╚═════╝ ╚══════╝',
];

const BANNER_WIDTH = 80; // Width of the banner

export interface ANSIRendererOptions {
  onQuit?: () => void;
}

export class ANSIRenderer extends EventEmitter {
  private stateManager: TUIStateManager;
  private options: ANSIRendererOptions;
  private isRunning = false;
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
    
    // Intercept console output to prevent it bleeding through the TUI
    this.interceptConsole();
    
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

  private interceptConsole(): void {
    const stateManager = this.stateManager;
    
    // Helper to add messages to the log
    const addToLog = (level: 'info' | 'warn' | 'error' | 'debug', message: string) => {
      // Skip empty messages and ANSI control sequences
      if (!message.trim() || message.startsWith('\x1b[')) return;
      
      // Skip our own render output
      if (message.includes('TASKS') || message.includes('ACTIVITY') || message.includes('█')) return;
      
      stateManager.addLog({
        service: 'system',
        level,
        message: message.trim(),
      });
    };

    // Intercept console methods
    console.log = (...args: unknown[]) => {
      const message = args.map(a => 
        typeof a === 'string' ? a : JSON.stringify(a)
      ).join(' ');
      addToLog('info', message);
    };
    console.info = (...args: unknown[]) => {
      const message = args.map(a => 
        typeof a === 'string' ? a : JSON.stringify(a)
      ).join(' ');
      addToLog('info', message);
    };
    console.warn = (...args: unknown[]) => {
      const message = args.map(a => 
        typeof a === 'string' ? a : JSON.stringify(a)
      ).join(' ');
      addToLog('warn', message);
    };
    console.error = (...args: unknown[]) => {
      const message = args.map(a => 
        typeof a === 'string' ? a : JSON.stringify(a)
      ).join(' ');
      addToLog('error', message);
    };
    console.debug = (...args: unknown[]) => {
      const message = args.map(a => 
        typeof a === 'string' ? a : JSON.stringify(a)
      ).join(' ');
      addToLog('debug', message);
    };

    // Intercept stdout.write - this catches console.log AND direct writes
    // We need to allow our own render output through
    let isRendering = false;
    
    const stdoutWrite = (chunk: unknown): boolean => {
      // If we're rendering, let it through
      if (isRendering) {
        return originalStdout.write(chunk as string);
      }
      
      // Otherwise capture it
      const str = typeof chunk === 'string' ? chunk : String(chunk);
      
      // Skip ANSI sequences (cursor movement, clear screen, etc.)
      if (str.startsWith('\x1b[') || str === '\n') {
        return true;
      }
      
      // Add non-empty content to logs
      if (str.trim()) {
        addToLog('info', str);
      }
      
      return true;
    };
    
    process.stdout.write = stdoutWrite as typeof process.stdout.write;

    // Intercept stderr.write
    const stderrWrite = (chunk: unknown): boolean => {
      const str = typeof chunk === 'string' ? chunk : String(chunk);
      if (str.trim() && !str.startsWith('\x1b[')) {
        addToLog('error', str);
      }
      return true;
    };
    
    process.stderr.write = stderrWrite as typeof process.stderr.write;

    // Store the isRendering setter for use in render()
    this.setRendering = (value: boolean) => { isRendering = value; };
  }

  private setRendering: (value: boolean) => void = () => {};

  private restoreConsole(): void {
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
    (process.stdout as unknown as { write: typeof process.stdout.write }).write = originalStdout.write;
    (process.stderr as unknown as { write: typeof process.stderr.write }).write = originalStderr.write;
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    
    // Restore console before any cleanup logging
    this.restoreConsole();
    
    if (this.renderInterval) {
      clearInterval(this.renderInterval);
      this.renderInterval = null;
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
      case 'l':
      case 'L':
        // Toggle raw logs view
        if (state.viewMode === 'raw') {
          this.stateManager.setViewMode('activity');
        } else {
          this.stateManager.setViewMode('raw');
        }
        break;
      case '?':
        this.stateManager.setViewMode('help');
        break;
      case '\x1b': // Escape
        if (state.viewMode === 'help' || state.viewMode === 'raw') {
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

    // Mark that we're rendering so stdout intercept lets our output through
    this.setRendering(true);

    const state = this.stateManager.getState();
    const { columns: width = 80, rows: height = 24 } = process.stdout;
    
    // Calculate available heights
    // Banner: 6 lines + subtitle + empty = 8 lines (or 2 for compact)
    // Status bar: 2 lines
    // Footer: 2 lines
    const bannerHeight = width < BANNER_WIDTH ? 2 : 8;
    const statusBarHeight = 2;
    const footerHeight = 2;
    const contentHeight = Math.max(1, height - bannerHeight - statusBarHeight - footerHeight);
    
    let lines: string[] = [];

    // Render based on view mode
    if (state.viewMode === 'raw') {
      lines.push(...this.renderRawLogsFullScreen(state, width, height));
    } else if (state.viewMode === 'help') {
      lines.push(...this.renderBanner(width));
      const helpHeight = Math.max(1, height - bannerHeight - footerHeight);
      lines.push(...this.renderHelp(width, helpHeight));
      // Pad to fill screen
      while (lines.length < height - footerHeight) {
        lines.push('');
      }
      lines.push(...this.renderFooter(state, width));
    } else {
      // Default split-column view
      lines.push(...this.renderBanner(width));
      lines.push(...this.renderStatusBar(state, width));
      lines.push(...this.renderSplitColumns(state, width, contentHeight));
      lines.push(...this.renderFooter(state, width));
    }

    // IMPORTANT: Truncate to exactly terminal height to prevent overflow
    if (lines.length > height) {
      lines = lines.slice(0, height);
    }
    
    // Pad to exactly fill the screen (prevents leftover content from previous renders)
    while (lines.length < height) {
      lines.push('');
    }

    // Build output - pad each line to full width
    const output = lines.map(line => {
      const visible = this.stripAnsi(line);
      if (visible.length > width) {
        // Truncate long lines
        return line.substring(0, width);
      }
      // Pad short lines to full width
      return line + ' '.repeat(Math.max(0, width - visible.length));
    }).join('\n');

    // Only update if changed
    if (output !== this.lastRender) {
      this.lastRender = output;
      // Hide cursor, move to top-left, write output
      process.stdout.write(ansi.hideCursor);
      process.stdout.write(ansi.moveTo(1, 1));
      process.stdout.write(output);
    }
    
    // Done rendering
    this.setRendering(false);
  }

  private stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }

  private renderBanner(width: number): string[] {
    const lines: string[] = [];
    
    // Colors: Cyan for SENTRY, Sentry purple for VIBE
    const cyan = '#00D4FF';
    const sentryPurple = '#6C5FC7';  // Sentry's brand purple
    
    // If terminal is too narrow for the full banner, show compact version
    if (width < BANNER_WIDTH) {
      lines.push(`${ansi.fg(cyan)}${ansi.bold}SENTRY${ansi.reset}${ansi.fg(sentryPurple)}${ansi.bold}VIBE${ansi.reset} ${ansi.fg(Colors.textDim)}RUNNER${ansi.reset}`);
      lines.push('');
      return lines;
    }
    
    // Render full banner - no padding to ensure it fits
    // Looking at ASCII art structure: SENTRY ends around col 51, VIBE starts at col 52
    const splitPoint = 52;
    
    for (let i = 0; i < BANNER_LINES.length; i++) {
      let line = BANNER_LINES[i];
      
      // Trim banner line if terminal is exactly 80 chars wide
      if (line.length > width) {
        line = line.substring(0, width);
      }
      
      // Split at the exact point between SENTRY and VIBE
      const leftPart = line.substring(0, splitPoint);
      const rightPart = line.substring(splitPoint);
      
      lines.push(
        `${ansi.fg(cyan)}${leftPart}${ansi.fg(sentryPurple)}${rightPart}${ansi.reset}`
      );
    }
    
    // Subtitle
    lines.push(`${ansi.fg(Colors.textDim)}R U N N E R${ansi.reset}`);
    lines.push('');
    
    return lines;
  }

  private renderStatusBar(state: TUIState, width: number): string[] {
    const lines: string[] = [];
    
    // Connection status
    let leftStatus: string;
    
    if (state.isConnected) {
      leftStatus = `${ansi.fg(Colors.success)}● Connected${ansi.reset}`;
    } else {
      // Animated "Waiting for connection..." with moving gradient
      const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      const spinnerIdx = Math.floor(Date.now() / 100) % spinnerChars.length;
      const spinner = spinnerChars[spinnerIdx];
      
      const text = 'Waiting for connection...';
      // Create a moving gradient effect across the text
      const gradientPos = Math.floor(Date.now() / 150) % (text.length + 6);
      
      let gradientText = '';
      for (let i = 0; i < text.length; i++) {
        const dist = Math.abs(i - gradientPos);
        if (dist <= 2) {
          // Bright part of gradient (cyan -> white -> cyan)
          gradientText += `${ansi.fg('#FFFFFF')}${text[i]}`;
        } else if (dist <= 4) {
          // Medium part (purple)
          gradientText += `${ansi.fg(Colors.primary)}${text[i]}`;
        } else {
          // Dim part
          gradientText += `${ansi.fg(Colors.textDim)}${text[i]}`;
        }
      }
      
      leftStatus = `${ansi.fg(Colors.warning)}${spinner}${ansi.reset} ${gradientText}${ansi.reset}`;
    }
    
    // Build status
    let statusText = 'Idle';
    let statusColor: string = Colors.textDim;
    
    if (state.session) {
      const statusLabels: Record<string, string> = {
        idle: 'Idle',
        connecting: 'Connecting...',
        planning: 'Planning',
        building: 'Building',
        completed: 'Completed',
        failed: 'Failed',
      };
      const statusColors: Record<string, string> = {
        idle: Colors.textDim,
        connecting: Colors.warning,
        planning: Colors.info,
        building: Colors.primary,
        completed: Colors.success,
        failed: Colors.error,
      };
      statusText = statusLabels[state.session.status] || 'Unknown';
      statusColor = statusColors[state.session.status] || Colors.textDim;
    }
    
    const projectInfo = state.session 
      ? `${ansi.fg(Colors.text)}Project: ${state.session.projectName}${ansi.reset}`
      : `${ansi.fg(Colors.textDim)}Waiting for build...${ansi.reset}`;
    const rightStatus = `${ansi.fg(statusColor)}[${statusText.toUpperCase()}]${ansi.reset}`;
    
    // Calculate padding
    const leftLen = this.stripAnsi(leftStatus).length + this.stripAnsi(projectInfo).length + 3;
    const rightLen = this.stripAnsi(rightStatus).length;
    const middlePad = Math.max(1, width - leftLen - rightLen);
    
    lines.push(`${leftStatus}  ${projectInfo}${' '.repeat(middlePad)}${rightStatus}`);
    lines.push(`${ansi.fg(Colors.border)}${'─'.repeat(width)}${ansi.reset}`);
    
    return lines;
  }

  private renderSplitColumns(state: TUIState, width: number, maxLines: number): string[] {
    const lines: string[] = [];
    
    // Calculate column widths (1/5 for todos, 4/5 for activity)
    const todoWidth = Math.max(25, Math.floor(width / 5));
    const activityWidth = width - todoWidth - 1; // -1 for separator
    
    // Generate content for both columns
    const todoLines = this.renderTodoColumn(state, todoWidth, maxLines);
    const activityLines = this.renderActivityColumn(state, activityWidth, maxLines);
    
    // Combine columns row by row
    for (let i = 0; i < maxLines; i++) {
      const todoLine = todoLines[i] || '';
      const activityLine = activityLines[i] || '';
      
      // Pad todo column to exact width
      const todoVisible = this.stripAnsi(todoLine);
      const todoPadded = todoLine + ' '.repeat(Math.max(0, todoWidth - todoVisible.length));
      
      // Add separator and activity
      lines.push(`${todoPadded}${ansi.fg(Colors.border)}│${ansi.reset}${activityLine}`);
    }
    
    return lines;
  }

  private renderTodoColumn(state: TUIState, width: number, maxLines: number): string[] {
    const lines: string[] = [];
    
    // Title
    lines.push(`${ansi.fg(Colors.primary)}${ansi.bold} TASKS${ansi.reset}`);
    
    // Show waiting state if no todos
    if (state.todos.length === 0) {
      lines.push('');
      lines.push(` ${ansi.fg(Colors.textDim)}Waiting for${ansi.reset}`);
      lines.push(` ${ansi.fg(Colors.textDim)}activity...${ansi.reset}`);
      lines.push('');
      lines.push(` ${ansi.fg(Colors.textMuted)}Tasks will${ansi.reset}`);
      lines.push(` ${ansi.fg(Colors.textMuted)}appear here${ansi.reset}`);
      lines.push(` ${ansi.fg(Colors.textMuted)}when a build${ansi.reset}`);
      lines.push(` ${ansi.fg(Colors.textMuted)}starts.${ansi.reset}`);
      return lines;
    }
    
    // Progress stats
    const completed = state.todos.filter(t => t.status === 'completed').length;
    const total = state.todos.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    // Progress bar
    const barWidth = Math.min(width - 4, 18);
    const filled = Math.round((percentage / 100) * barWidth);
    lines.push(
      ` ${ansi.fg(Colors.success)}${'█'.repeat(filled)}${ansi.fg(Colors.textDim)}${'░'.repeat(barWidth - filled)}${ansi.reset}`
    );
    lines.push(` ${ansi.fg(Colors.textMuted)}${completed}/${total} complete${ansi.reset}`);
    lines.push('');
    
    // Todo items in tree style
    // Reserve lines: title(1) + progress bar(1) + complete text(1) + empty(1) = 4 lines used
    // We need to stay within maxLines total
    for (let i = 0; i < state.todos.length; i++) {
      // Stop if we've used all available lines (leave 1 for potential overflow indicator)
      if (lines.length >= maxLines - 1) {
        const remaining = state.todos.length - i;
        if (remaining > 0) {
          lines.push(`${ansi.fg(Colors.textMuted)} +${remaining} more...${ansi.reset}`);
        }
        break;
      }
      
      const todo = state.todos[i];
      const isActive = i === state.activeTodoIndex;
      const isLast = i === state.todos.length - 1;
      
      // Tree branch characters
      const branch = isLast ? '└' : '├';
      const branchColor = isActive ? Colors.primary : Colors.border;
      
      // Status icons - use spinner for in_progress
      let statusIcon: string;
      if (todo.status === 'in_progress') {
        const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        const spinnerIdx = Math.floor(Date.now() / 100) % spinnerChars.length;
        statusIcon = spinnerChars[spinnerIdx];
      } else {
        const statusIcons: Record<string, string> = {
          pending: '○',
          completed: '✓',
          failed: '✗',
        };
        statusIcon = statusIcons[todo.status] || '○';
      }
      
      // Status colors
      const statusColor = 
        todo.status === 'completed' ? Colors.success 
        : todo.status === 'in_progress' ? Colors.primary 
        : todo.status === 'failed' ? Colors.error 
        : Colors.textDim;
      
      // Truncate content to fit column
      const maxContentLen = width - 6;
      let content = todo.content;
      if (content.length > maxContentLen) {
        content = content.substring(0, maxContentLen - 2) + '..';
      }
      
      // For in_progress items, apply a moving gradient effect
      let formattedContent: string;
      if (todo.status === 'in_progress') {
        // Create a moving gradient effect across the text
        const gradientPos = Math.floor(Date.now() / 150) % (content.length + 6);
        formattedContent = '';
        for (let j = 0; j < content.length; j++) {
          const dist = Math.abs(j - gradientPos);
          if (dist <= 1) {
            // Bright highlight
            formattedContent += `${ansi.fg('#FFFFFF')}${content[j]}`;
          } else if (dist <= 3) {
            // Primary color
            formattedContent += `${ansi.fg(Colors.primary)}${content[j]}`;
          } else {
            // Normal text
            formattedContent += `${ansi.fg(Colors.text)}${content[j]}`;
          }
        }
        formattedContent += ansi.reset;
      } else {
        // Normal styling for non-active items
        const contentColor = todo.status === 'completed' ? Colors.textMuted : Colors.textDim;
        formattedContent = `${ansi.fg(contentColor)}${content}${ansi.reset}`;
      }
      
      // Build the line
      const line = `${ansi.fg(branchColor)}${branch}${ansi.reset}` +
        `${ansi.fg(statusColor)}${statusIcon}${ansi.reset} ` +
        formattedContent;
      
      lines.push(line);
    }
    
    // Ensure we don't exceed maxLines
    if (lines.length > maxLines) {
      lines.length = maxLines;
    }
    
    return lines;
  }

  private renderActivityColumn(state: TUIState, width: number, maxLines: number): string[] {
    const lines: string[] = [];
    
    // Title
    lines.push(` ${ansi.fg(Colors.primary)}${ansi.bold}ACTIVITY${ansi.reset}`);
    lines.push('');
    
    // Current action highlight box
    if (state.currentAction) {
      const icon = ToolIcons[state.currentAction.name] || ToolIcons.default;
      const boxWidth = Math.min(width - 4, 60);
      
      // Truncate description
      let desc = state.currentAction.description;
      const maxDescLen = boxWidth - state.currentAction.name.length - 6;
      if (desc.length > maxDescLen) {
        desc = desc.substring(0, maxDescLen - 2) + '..';
      }
      
      lines.push(` ${ansi.fg(Colors.primary)}┌${'─'.repeat(boxWidth)}┐${ansi.reset}`);
      lines.push(` ${ansi.fg(Colors.primary)}│${ansi.reset} ${icon} ${ansi.fg(Colors.text)}${ansi.bold}${state.currentAction.name}${ansi.reset}: ${desc}`);
      lines.push(` ${ansi.fg(Colors.primary)}└${'─'.repeat(boxWidth)}┘${ansi.reset}`);
      lines.push('');
    }
    
    // Activity items
    const activityStartLine = lines.length;
    const availableLines = maxLines - activityStartLine;
    const actions = state.actions.slice(state.scrollOffset, state.scrollOffset + availableLines);
    
    if (actions.length === 0 && !state.currentAction) {
      lines.push(` ${ansi.fg(Colors.textDim)}Waiting for activity...${ansi.reset}`);
    } else {
      for (const action of actions) {
        const icon = ToolIcons[action.name] || ToolIcons.default;
        const statusIcons: Record<string, string> = {
          pending: '○',
          running: '◐',
          success: '✓',
          error: '✗',
        };
        const statusIcon = statusIcons[action.status] || '○';
        const time = action.timestamp.toLocaleTimeString('en-US', { hour12: false });
        const duration = action.duration ? ` ${ansi.fg(Colors.textMuted)}(${action.duration}ms)${ansi.reset}` : '';
        
        const statusColors: Record<string, string> = {
          pending: Colors.textDim,
          running: Colors.warning,
          success: Colors.success,
          error: Colors.error,
        };
        const statusColor = statusColors[action.status] || Colors.textDim;
        
        // Truncate description
        let desc = action.description;
        const maxDescLen = width - 30;
        if (desc.length > maxDescLen) {
          desc = desc.substring(0, maxDescLen - 2) + '..';
        }
        
        lines.push(
          ` ${ansi.fg(Colors.textMuted)}${time}${ansi.reset} ` +
          `${ansi.fg(statusColor)}${statusIcon}${ansi.reset} ` +
          `${icon} ${ansi.fg(Colors.text)}${action.name}${ansi.reset}: ${desc}${duration}`
        );
      }
    }
    
    return lines;
  }

  private renderRawLogsFullScreen(state: TUIState, width: number, height: number): string[] {
    const lines: string[] = [];
    
    // Header
    lines.push(`${ansi.fg(Colors.primary)}${ansi.bold} RAW LOGS ${ansi.reset}${ansi.fg(Colors.textDim)}(Press L or Esc to go back)${ansi.reset}`);
    lines.push(`${ansi.fg(Colors.border)}${'─'.repeat(width)}${ansi.reset}`);
    
    // Logs
    const availableLines = height - 4;
    const logs = state.rawLogs.slice(
      Math.max(0, state.rawLogs.length - availableLines - state.scrollOffset),
      state.rawLogs.length - state.scrollOffset
    );
    
    if (logs.length === 0) {
      lines.push(`${ansi.fg(Colors.textDim)} No logs yet...${ansi.reset}`);
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
        
        // Truncate message to fit
        let message = log.message;
        const maxMsgLen = width - 20;
        if (message.length > maxMsgLen) {
          message = message.substring(0, maxMsgLen - 3) + '...';
        }
        
        lines.push(
          ` ${ansi.fg(Colors.textMuted)}${time}${ansi.reset} ` +
          `${ansi.fg(levelColor)}[${log.level.toUpperCase().padEnd(5)}]${ansi.reset} ` +
          `${ansi.fg(Colors.text)}${message}${ansi.reset}`
        );
      }
    }
    
    // Pad to fill screen
    while (lines.length < height - 2) {
      lines.push('');
    }
    
    // Footer
    lines.push(`${ansi.fg(Colors.border)}${'─'.repeat(width)}${ansi.reset}`);
    lines.push(`${ansi.fg(Colors.textDim)}[L] back  [↑↓] scroll  [g/G] top/bottom  [q] quit${ansi.reset}`);
    
    return lines;
  }

  private renderHelp(width: number, maxLines: number): string[] {
    const lines: string[] = [];

    lines.push(`${ansi.fg(Colors.primary)}${ansi.bold} KEYBOARD SHORTCUTS${ansi.reset}`);
    lines.push('');
    
    const shortcuts = [
      ['L', 'Toggle raw logs view'],
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
    lines.push(`${ansi.fg(Colors.textDim)} Press Esc to go back${ansi.reset}`);

    return lines;
  }

  private renderFooter(state: TUIState, width: number): string[] {
    const lines: string[] = [];

    // Separator
    lines.push(`${ansi.fg(Colors.border)}${'─'.repeat(width)}${ansi.reset}`);

    // Search input or shortcuts
    if (state.isSearching) {
      lines.push(
        `${ansi.fg(Colors.primary)} /${ansi.reset} ` +
        `${ansi.fg(Colors.text)}${state.searchQuery}█${ansi.reset} ` +
        `${ansi.fg(Colors.textMuted)}(Enter to search, Esc to cancel)${ansi.reset}`
      );
    } else {
      lines.push(`${ansi.fg(Colors.textDim)} [L] logs  [/] search  [↑↓] scroll  [?] help  [q] quit${ansi.reset}`);
    }

    return lines;
  }
}

// Factory function
export async function createANSIRenderer(options?: ANSIRendererOptions): Promise<ANSIRenderer> {
  const renderer = new ANSIRenderer(options);
  await renderer.start();
  return renderer;
}
