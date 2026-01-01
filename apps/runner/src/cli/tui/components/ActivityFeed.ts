/**
 * Activity Feed Component
 * Displays real-time tool actions as they happen
 */

import type { ToolAction, ToolStatus } from '../types.js';
import { Colors, ToolIcons, StatusIcons } from '../types.js';

export interface ActivityFeedProps {
  actions: ToolAction[];
  currentAction: ToolAction | null;
  scrollOffset: number;
  maxVisible?: number;
  searchQuery?: string;
}

export interface ActivityItemRenderData {
  time: string;
  icon: string;
  toolName: string;
  toolColor: string;
  description: string;
  statusIcon: string;
  statusColor: string;
  duration?: string;
  isCurrent: boolean;
}

export interface ActivityFeedRenderData {
  title: string;
  titleColor: string;
  items: ActivityItemRenderData[];
  currentAction: ActivityItemRenderData | null;
  hasMore: boolean;
  totalCount: number;
  isScrolled: boolean;
}

function getToolColor(toolName: string): string {
  const toolColors: Record<string, string> = {
    Read: Colors.toolRead,
    Write: Colors.toolWrite,
    Edit: Colors.toolEdit,
    Bash: Colors.toolBash,
    Glob: Colors.toolGlob,
    Grep: Colors.toolGrep,
    Task: Colors.toolTask,
    TodoWrite: Colors.toolTodo,
    TodoRead: Colors.toolTodo,
    WebFetch: Colors.info,
  };
  return toolColors[toolName] || Colors.textDim;
}

function getStatusIcon(status: ToolStatus): string {
  switch (status) {
    case 'success':
      return StatusIcons.success;
    case 'error':
      return StatusIcons.error;
    case 'running':
      return StatusIcons.running;
    default:
      return StatusIcons.pending;
  }
}

function getStatusColor(status: ToolStatus): string {
  switch (status) {
    case 'success':
      return Colors.success;
    case 'error':
      return Colors.error;
    case 'running':
      return Colors.warning;
    default:
      return Colors.textDim;
  }
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(ms?: number): string | undefined {
  if (!ms) return undefined;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function actionToRenderData(action: ToolAction, isCurrent: boolean): ActivityItemRenderData {
  return {
    time: formatTime(action.timestamp),
    icon: ToolIcons[action.name] || ToolIcons.default,
    toolName: action.name,
    toolColor: getToolColor(action.name),
    description: action.description,
    statusIcon: getStatusIcon(action.status),
    statusColor: getStatusColor(action.status),
    duration: formatDuration(action.duration),
    isCurrent,
  };
}

/**
 * Prepare activity feed data for rendering
 */
export function prepareActivityFeedData(props: ActivityFeedProps): ActivityFeedRenderData {
  const { actions, currentAction, scrollOffset, maxVisible = 15, searchQuery } = props;
  
  // Filter by search query if provided
  let filteredActions = actions;
  if (searchQuery && searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filteredActions = actions.filter(a => 
      a.name.toLowerCase().includes(query) ||
      a.description.toLowerCase().includes(query)
    );
  }
  
  // Calculate visible slice (actions are newest-first)
  const startIdx = scrollOffset;
  const endIdx = Math.min(filteredActions.length, startIdx + maxVisible);
  const visibleActions = filteredActions.slice(startIdx, endIdx);
  
  const items = visibleActions.map(action => 
    actionToRenderData(action, currentAction?.id === action.id)
  );
  
  return {
    title: 'ACTIVITY',
    titleColor: Colors.primary,
    items,
    currentAction: currentAction ? actionToRenderData(currentAction, true) : null,
    hasMore: filteredActions.length > endIdx,
    totalCount: filteredActions.length,
    isScrolled: scrollOffset > 0,
  };
}

/**
 * Render activity feed as ANSI strings
 */
export function renderActivityFeedAnsi(props: ActivityFeedProps, width: number = 80): string[] {
  const data = prepareActivityFeedData(props);
  const lines: string[] = [];
  
  // Header
  const scrollIndicator = data.isScrolled ? ' [SCROLLED]' : '';
  lines.push(`┌${'─'.repeat(width - 2)}┐`);
  lines.push(`│ ${data.title}${scrollIndicator}${' '.repeat(Math.max(0, width - data.title.length - scrollIndicator.length - 4))}│`);
  lines.push(`├${'─'.repeat(width - 2)}┤`);
  
  // Current action highlight
  if (data.currentAction && !data.isScrolled) {
    const ca = data.currentAction;
    const line = `→ ${ca.icon} ${ca.toolName}: ${ca.description}`;
    const truncatedLine = line.length > width - 4 ? line.slice(0, width - 7) + '...' : line;
    lines.push(`│ ${truncatedLine}${' '.repeat(Math.max(0, width - truncatedLine.length - 4))}│`);
    lines.push(`├${'─'.repeat(width - 2)}┤`);
  }
  
  // Activity items
  if (data.items.length === 0) {
    lines.push(`│ No activity yet...${' '.repeat(width - 22)}│`);
  } else {
    for (const item of data.items) {
      const durationStr = item.duration ? ` (${item.duration})` : '';
      const prefix = `${item.time} ${item.statusIcon}`;
      const content = `${item.icon} ${item.toolName}: ${item.description}`;
      const fullLine = `${prefix} ${content}${durationStr}`;
      const truncatedLine = fullLine.length > width - 4 
        ? fullLine.slice(0, width - 7) + '...' 
        : fullLine;
      const padding = ' '.repeat(Math.max(0, width - truncatedLine.length - 4));
      lines.push(`│ ${truncatedLine}${padding}│`);
    }
  }
  
  // Footer with count
  if (data.hasMore) {
    const moreCount = data.totalCount - props.maxVisible! - props.scrollOffset;
    lines.push(`│ ... ${moreCount} more actions${' '.repeat(Math.max(0, width - 20 - String(moreCount).length))}│`);
  }
  lines.push(`└${'─'.repeat(width - 2)}┘`);
  
  return lines;
}
