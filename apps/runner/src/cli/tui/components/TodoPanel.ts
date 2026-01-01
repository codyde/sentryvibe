/**
 * Todo Panel Component
 * Displays the task list with status indicators and progress
 */

import type { Todo } from '../types.js';
import { Colors, StatusIcons } from '../types.js';

export interface TodoPanelProps {
  todos: Todo[];
  activeTodoIndex: number;
  maxVisible?: number;
}

export interface TodoItemRenderData {
  icon: string;
  iconColor: string;
  content: string;
  contentColor: string;
  isActive: boolean;
  duration?: string;
}

export interface TodoPanelRenderData {
  title: string;
  titleColor: string;
  items: TodoItemRenderData[];
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
  hasMore: boolean;
  moreCount: number;
}

function getStatusIcon(status: Todo['status']): string {
  return StatusIcons[status] || StatusIcons.pending;
}

function getStatusColor(status: Todo['status']): string {
  switch (status) {
    case 'completed':
      return Colors.success;
    case 'in_progress':
      return Colors.primary;
    case 'failed':
      return Colors.error;
    default:
      return Colors.textDim;
  }
}

function formatDuration(startedAt?: Date, completedAt?: Date): string | undefined {
  if (!startedAt) return undefined;
  const end = completedAt || new Date();
  const ms = end.getTime() - startedAt.getTime();
  
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

/**
 * Prepare todo panel data for rendering
 */
export function prepareTodoPanelData(props: TodoPanelProps): TodoPanelRenderData {
  const { todos, activeTodoIndex, maxVisible = 10 } = props;
  
  const completed = todos.filter(t => t.status === 'completed').length;
  const total = todos.length;
  
  // Show todos around the active one
  let startIdx = 0;
  let endIdx = Math.min(todos.length, maxVisible);
  
  if (activeTodoIndex >= 0 && todos.length > maxVisible) {
    // Center around active todo
    const halfVisible = Math.floor(maxVisible / 2);
    startIdx = Math.max(0, activeTodoIndex - halfVisible);
    endIdx = Math.min(todos.length, startIdx + maxVisible);
    
    // Adjust if we're near the end
    if (endIdx === todos.length) {
      startIdx = Math.max(0, endIdx - maxVisible);
    }
  }
  
  const visibleTodos = todos.slice(startIdx, endIdx);
  const hasMore = todos.length > maxVisible;
  const moreCount = todos.length - maxVisible;
  
  const items: TodoItemRenderData[] = visibleTodos.map((todo, idx) => {
    const actualIdx = startIdx + idx;
    const isActive = actualIdx === activeTodoIndex;
    
    return {
      icon: getStatusIcon(todo.status),
      iconColor: getStatusColor(todo.status),
      content: todo.content,
      contentColor: isActive ? Colors.text : Colors.textDim,
      isActive,
      duration: formatDuration(todo.startedAt, todo.completedAt),
    };
  });
  
  return {
    title: 'TASKS',
    titleColor: Colors.primary,
    items,
    progress: {
      completed,
      total,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    },
    hasMore,
    moreCount,
  };
}

/**
 * Render todo panel as ANSI strings
 */
export function renderTodoPanelAnsi(props: TodoPanelProps, width: number = 60): string[] {
  const data = prepareTodoPanelData(props);
  const lines: string[] = [];
  
  // Header with progress
  const progressBar = createProgressBar(data.progress.percentage, 20);
  lines.push(`┌${'─'.repeat(width - 2)}┐`);
  lines.push(`│ ${data.title} ${progressBar} ${data.progress.completed}/${data.progress.total}${' '.repeat(Math.max(0, width - data.title.length - 30))}│`);
  lines.push(`├${'─'.repeat(width - 2)}┤`);
  
  // Todo items
  if (data.items.length === 0) {
    lines.push(`│ No tasks yet...${' '.repeat(width - 18)}│`);
  } else {
    for (const item of data.items) {
      const prefix = item.isActive ? '→ ' : '  ';
      const duration = item.duration ? ` (${item.duration})` : '';
      const content = truncate(item.content, width - 10 - duration.length);
      const padding = ' '.repeat(Math.max(0, width - 4 - prefix.length - item.icon.length - content.length - duration.length));
      lines.push(`│${prefix}${item.icon} ${content}${duration}${padding}│`);
    }
  }
  
  // Footer
  if (data.hasMore) {
    lines.push(`│ ... and ${data.moreCount} more${' '.repeat(width - 16 - String(data.moreCount).length)}│`);
  }
  lines.push(`└${'─'.repeat(width - 2)}┘`);
  
  return lines;
}

function createProgressBar(percentage: number, width: number): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
