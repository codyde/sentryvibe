/**
 * Footer Component
 * Displays keyboard shortcuts and status bar
 */

import type { ViewMode } from '../types.js';
import { Colors } from '../types.js';

export interface FooterProps {
  viewMode: ViewMode;
  isSearching: boolean;
  searchQuery: string;
  isScrolled: boolean;
}

export interface ShortcutRenderData {
  key: string;
  label: string;
  keyColor: string;
  labelColor: string;
}

export interface FooterRenderData {
  shortcuts: ShortcutRenderData[];
  searchMode: boolean;
  searchQuery: string;
  scrollIndicator: boolean;
}

const VIEW_SHORTCUTS: Record<ViewMode, ShortcutRenderData[]> = {
  activity: [
    { key: 't', label: 'todos', keyColor: Colors.primary, labelColor: Colors.textDim },
    { key: 'r', label: 'raw', keyColor: Colors.primary, labelColor: Colors.textDim },
    { key: '/', label: 'search', keyColor: Colors.primary, labelColor: Colors.textDim },
    { key: '↑↓', label: 'scroll', keyColor: Colors.primary, labelColor: Colors.textDim },
    { key: 'g/G', label: 'top/end', keyColor: Colors.primary, labelColor: Colors.textDim },
    { key: '?', label: 'help', keyColor: Colors.primary, labelColor: Colors.textDim },
    { key: 'q', label: 'quit', keyColor: Colors.error, labelColor: Colors.textDim },
  ],
  todos: [
    { key: 'a', label: 'activity', keyColor: Colors.primary, labelColor: Colors.textDim },
    { key: 'r', label: 'raw', keyColor: Colors.primary, labelColor: Colors.textDim },
    { key: '↑↓', label: 'scroll', keyColor: Colors.primary, labelColor: Colors.textDim },
    { key: '?', label: 'help', keyColor: Colors.primary, labelColor: Colors.textDim },
    { key: 'q', label: 'quit', keyColor: Colors.error, labelColor: Colors.textDim },
  ],
  raw: [
    { key: 'a', label: 'activity', keyColor: Colors.primary, labelColor: Colors.textDim },
    { key: 't', label: 'todos', keyColor: Colors.primary, labelColor: Colors.textDim },
    { key: '/', label: 'search', keyColor: Colors.primary, labelColor: Colors.textDim },
    { key: '↑↓', label: 'scroll', keyColor: Colors.primary, labelColor: Colors.textDim },
    { key: '?', label: 'help', keyColor: Colors.primary, labelColor: Colors.textDim },
    { key: 'q', label: 'quit', keyColor: Colors.error, labelColor: Colors.textDim },
  ],
  help: [
    { key: 'Esc', label: 'back', keyColor: Colors.primary, labelColor: Colors.textDim },
    { key: 'q', label: 'quit', keyColor: Colors.error, labelColor: Colors.textDim },
  ],
};

/**
 * Prepare footer data for rendering
 */
export function prepareFooterData(props: FooterProps): FooterRenderData {
  const { viewMode, isSearching, searchQuery, isScrolled } = props;
  
  return {
    shortcuts: VIEW_SHORTCUTS[viewMode],
    searchMode: isSearching,
    searchQuery,
    scrollIndicator: isScrolled,
  };
}

/**
 * Render footer as ANSI string
 */
export function renderFooterAnsi(props: FooterProps, width: number = 80): string[] {
  const data = prepareFooterData(props);
  const lines: string[] = [];
  
  // Separator
  lines.push('─'.repeat(width));
  
  if (data.searchMode) {
    // Search input mode
    const searchLine = `/ ${data.searchQuery}█`;
    const hint = '(Enter to search, Esc to cancel)';
    const padding = ' '.repeat(Math.max(0, width - searchLine.length - hint.length - 2));
    lines.push(`${searchLine}${padding}${hint}`);
  } else {
    // Shortcuts display
    const shortcutsStr = data.shortcuts
      .map(s => `[${s.key}] ${s.label}`)
      .join('  ');
    
    const scrollStr = data.scrollIndicator ? ' [SCROLLED - G to resume]' : '';
    const availableWidth = width - scrollStr.length;
    
    const truncatedShortcuts = shortcutsStr.length > availableWidth
      ? shortcutsStr.slice(0, availableWidth - 3) + '...'
      : shortcutsStr;
    
    const padding = ' '.repeat(Math.max(0, width - truncatedShortcuts.length - scrollStr.length));
    lines.push(`${truncatedShortcuts}${padding}${scrollStr}`);
  }
  
  return lines;
}

/**
 * Render help screen
 */
export function renderHelpScreen(width: number = 80): string[] {
  const lines: string[] = [];
  
  lines.push('');
  lines.push('  KEYBOARD SHORTCUTS');
  lines.push('  ' + '─'.repeat(40));
  lines.push('');
  lines.push('  Navigation');
  lines.push('    [a]        Switch to Activity view');
  lines.push('    [t]        Switch to Todos view');
  lines.push('    [r]        Switch to Raw logs view');
  lines.push('    [?]        Show this help');
  lines.push('    [Esc]      Back / Cancel');
  lines.push('');
  lines.push('  Scrolling');
  lines.push('    [↑] [k]    Scroll up');
  lines.push('    [↓] [j]    Scroll down');
  lines.push('    [PgUp]     Page up');
  lines.push('    [PgDn]     Page down');
  lines.push('    [g]        Go to top (oldest)');
  lines.push('    [G]        Go to bottom (newest)');
  lines.push('');
  lines.push('  Search');
  lines.push('    [/]        Start search');
  lines.push('    [Enter]    Apply search');
  lines.push('    [Esc]      Cancel search');
  lines.push('');
  lines.push('  General');
  lines.push('    [q]        Quit');
  lines.push('    [Ctrl+C]   Force quit');
  lines.push('');
  lines.push('  ' + '─'.repeat(40));
  lines.push('  Press [Esc] to return');
  lines.push('');
  
  return lines;
}
