/**
 * Smart Todo Tracker
 *
 * Maintains task state and automatically infers progress from tool completions.
 * Combines AI-reported status with inferred state for maximum reliability.
 */

import type { TodoItem } from '@sentryvibe/agent-core/types/generation';
import { buildLogger } from '@sentryvibe/agent-core/lib/logging/build-logger';

export interface SmartTodoTracker {
  todos: TodoItem[];
  currentIndex: number;
  lastSyncedFromAI: Date | null;
  manualOverride: boolean;
}

/**
 * Create a new tracker with initial todos
 */
export function createSmartTracker(initialTodos: TodoItem[]): SmartTodoTracker {
  // Find the first in-progress task, or mark first as in-progress
  let currentIndex = initialTodos.findIndex(t => t.status === 'in_progress');

  if (currentIndex === -1) {
    // No task in progress, start with first pending task
    currentIndex = initialTodos.findIndex(t => t.status === 'pending');
    if (currentIndex !== -1) {
      initialTodos[currentIndex].status = 'in_progress';
    } else {
      currentIndex = 0;
    }
  }

  buildLogger.codexQuery.taskListStatus(
    initialTodos.filter(t => t.status === 'completed').length,
    initialTodos.filter(t => t.status === 'in_progress').length,
    initialTodos.filter(t => t.status === 'pending').length,
    initialTodos.length
  );

  return {
    todos: initialTodos,
    currentIndex,
    lastSyncedFromAI: null,
    manualOverride: false,
  };
}

/**
 * Handle tool completion - automatically advance to next task
 */
export function handleToolCompletion(
  tracker: SmartTodoTracker,
  toolName: string,
  wasSuccessful: boolean = true
): TodoItem[] {
  if (tracker.manualOverride) {
    // AI explicitly provided status, don't auto-advance yet
    return tracker.todos;
  }

  const currentTodo = tracker.todos[tracker.currentIndex];

  if (!currentTodo) {
    return tracker.todos;
  }

  // Don't auto-complete on failed tools
  if (!wasSuccessful) {
    buildLogger.codexQuery.error(
      `Tool ${toolName} failed, not auto-completing task`,
      new Error('Tool failed')
    );
    return tracker.todos;
  }

  // Mark current as completed
  if (currentTodo.status === 'in_progress') {
    currentTodo.status = 'completed';
    buildLogger.codexQuery.taskListTask(
      tracker.currentIndex,
      currentTodo.content,
      'completed',
      '✅'
    );

    // Move to next task if available
    if (tracker.currentIndex + 1 < tracker.todos.length) {
      tracker.currentIndex++;
      const nextTodo = tracker.todos[tracker.currentIndex];
      if (nextTodo.status === 'pending') {
        nextTodo.status = 'in_progress';
        buildLogger.codexQuery.taskListTask(
          tracker.currentIndex,
          nextTodo.content,
          'in_progress',
          '⏳'
        );
      }
    } else {
      buildLogger.codexQuery.allComplete();
    }
  }

  return tracker.todos;
}

/**
 * Sync with AI-provided todo list
 * This takes precedence over inferred state
 */
export function syncWithAI(
  tracker: SmartTodoTracker,
  aiTodos: TodoItem[]
): TodoItem[] {
  // Validate AI todos
  if (!Array.isArray(aiTodos) || aiTodos.length === 0) {
    buildLogger.codexQuery.error(
      'Invalid AI todos received, keeping tracker state',
      new Error('Invalid todos')
    );
    return tracker.todos;
  }

  // Check if AI todos are valid
  const isValid = aiTodos.every((t: TodoItem) =>
    typeof t.content === 'string' &&
    typeof t.activeForm === 'string' &&
    ['pending', 'in_progress', 'completed'].includes(t.status)
  );

  if (!isValid) {
    buildLogger.codexQuery.error(
      'AI todos have invalid format, keeping tracker state',
      new Error('Invalid format')
    );
    return tracker.todos;
  }

  // Count in-progress tasks
  const inProgressCount = aiTodos.filter(t => t.status === 'in_progress').length;

  if (inProgressCount > 1) {
    buildLogger.codexQuery.error(
      `AI provided ${inProgressCount} in-progress tasks, should be 1`,
      new Error('Multiple in-progress')
    );
    // Fix it by keeping only the first in-progress
    let foundFirst = false;
    aiTodos.forEach(t => {
      if (t.status === 'in_progress') {
        if (foundFirst) {
          t.status = 'pending';
        } else {
          foundFirst = true;
        }
      }
    });
  }

  // Update tracker with AI state
  tracker.todos = aiTodos;
  tracker.currentIndex = aiTodos.findIndex(t => t.status === 'in_progress');
  if (tracker.currentIndex === -1) {
    tracker.currentIndex = aiTodos.findIndex(t => t.status === 'pending');
  }
  tracker.lastSyncedFromAI = new Date();
  tracker.manualOverride = false; // Clear override flag after sync

  buildLogger.codexQuery.taskListStatus(
    aiTodos.filter(t => t.status === 'completed').length,
    aiTodos.filter(t => t.status === 'in_progress').length,
    aiTodos.filter(t => t.status === 'pending').length,
    aiTodos.length
  );

  return tracker.todos;
}

/**
 * Check if all tasks are complete
 */
export function isComplete(tracker: SmartTodoTracker): boolean {
  return tracker.todos.length > 0 &&
         tracker.todos.every(t => t.status === 'completed');
}

/**
 * Get current task
 */
export function getCurrentTask(tracker: SmartTodoTracker): TodoItem | null {
  return tracker.todos[tracker.currentIndex] || null;
}

/**
 * Mark tracker as overridden (AI will provide next update)
 */
export function markAsOverridden(tracker: SmartTodoTracker): void {
  tracker.manualOverride = true;
}
