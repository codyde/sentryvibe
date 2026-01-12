/**
 * BuildPanel - Left panel showing current build info and todo list
 * Takes up 20% of width, shows:
 * - Project name
 * - Template name
 * - Agent/model
 * - Elapsed time
 * - Todo list with status indicators
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { colors, symbols } from '../theme.js';
import type { BuildInfo, TodoItem } from '../../../lib/logging/types.js';

interface BuildPanelProps {
  build: BuildInfo | null;
  width: number;
  height?: number;
}

export function BuildPanel({ build, width, height }: BuildPanelProps) {
  const [elapsedTime, setElapsedTime] = useState(0);

  // Update elapsed time every second
  useEffect(() => {
    if (!build || build.status !== 'running') {
      setElapsedTime(0);
      return;
    }

    const startTime = build.startTime;
    const updateElapsed = () => {
      const now = Date.now();
      setElapsedTime(Math.floor((now - startTime) / 1000));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [build?.id, build?.status, build?.startTime]);

  // Don't render if no build
  if (!build) {
    return null;
  }

  const truncate = (str: string, maxLen: number) => {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 3) + '...';
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Determine elapsed time to show
  const displayElapsed = build.status === 'running' 
    ? elapsedTime 
    : build.endTime 
      ? Math.floor((build.endTime - build.startTime) / 1000)
      : 0;

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor={colors.darkGray}
      paddingX={1}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text color={colors.cyan} bold>BUILD</Text>
      </Box>

      {/* Project name */}
      <Box>
        <Text color={colors.white}>{truncate(build.projectSlug, width - 4)}</Text>
      </Box>

      {/* Template */}
      {build.template && (
        <Box>
          <Text color={colors.gray}>{truncate(build.template, width - 4)}</Text>
        </Box>
      )}

      {/* Agent/model */}
      <Box>
        <Text color={colors.gray}>
          {build.agent === 'claude-code' ? build.model : build.agent}
        </Text>
      </Box>

      {/* Elapsed time with status */}
      <Box marginTop={1}>
        {build.status === 'running' && (
          <Text color={colors.cyan}>
            {symbols.spinnerFrames[Math.floor(Date.now() / 120) % symbols.spinnerFrames.length]} {formatDuration(displayElapsed)}
          </Text>
        )}
        {build.status === 'completed' && (
          <Text color={colors.success}>
            {symbols.check} {formatDuration(displayElapsed)}
          </Text>
        )}
        {build.status === 'failed' && (
          <Text color={colors.error}>
            {symbols.cross} {formatDuration(displayElapsed)}
          </Text>
        )}
        {build.status === 'pending' && (
          <Text color={colors.gray}>Pending...</Text>
        )}
      </Box>

      {/* Todo list */}
      {build.todos.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={colors.dimGray} bold>TASKS</Text>
          <TodoList todos={build.todos} maxWidth={width - 6} maxVisible={10} />
        </Box>
      )}

      {/* Error message if failed */}
      {build.status === 'failed' && build.error && (
        <Box marginTop={1}>
          <Text color={colors.error} wrap="truncate">
            {truncate(build.error, width - 4)}
          </Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * TodoList - Smart display of todo items
 * - Shows up to maxVisible items (default 10)
 * - Prioritizes in_progress and pending tasks
 * - Hides completed tasks when space is needed
 * - Shows count of hidden completed tasks
 */
function TodoList({ todos, maxWidth, maxVisible = 10 }: { 
  todos: TodoItem[]; 
  maxWidth: number;
  maxVisible?: number;
}) {
  // Separate todos by status
  const inProgress = todos.filter(t => t.status === 'in_progress');
  const pending = todos.filter(t => t.status === 'pending');
  const completed = todos.filter(t => t.status === 'completed');
  const cancelled = todos.filter(t => t.status === 'cancelled');
  
  // Calculate how many slots we have for each category
  // Priority: in_progress > pending > completed > cancelled
  const activeCount = inProgress.length + pending.length;
  
  let visibleTodos: TodoItem[] = [];
  let hiddenCompletedCount = 0;
  
  if (todos.length <= maxVisible) {
    // All todos fit - show them in order
    visibleTodos = todos;
  } else {
    // Need to prioritize - always show in_progress and pending first
    visibleTodos = [...inProgress, ...pending];
    
    // Calculate remaining slots for completed tasks
    const remainingSlots = maxVisible - visibleTodos.length;
    
    if (remainingSlots > 0) {
      // Show as many completed as we can fit
      visibleTodos = [...visibleTodos, ...completed.slice(0, remainingSlots)];
      hiddenCompletedCount = Math.max(0, completed.length - remainingSlots);
    } else {
      hiddenCompletedCount = completed.length;
    }
    
    // Add cancelled if there's still room
    const slotsAfterCompleted = maxVisible - visibleTodos.length;
    if (slotsAfterCompleted > 0) {
      visibleTodos = [...visibleTodos, ...cancelled.slice(0, slotsAfterCompleted)];
    }
  }
  
  // Sort visible todos to maintain logical order (by original index)
  visibleTodos.sort((a, b) => {
    const aIndex = todos.findIndex(t => t.id === a.id);
    const bIndex = todos.findIndex(t => t.id === b.id);
    return aIndex - bIndex;
  });
  
  return (
    <>
      {visibleTodos.map((todo) => (
        <TodoRow key={todo.id} todo={todo} maxWidth={maxWidth} />
      ))}
      {hiddenCompletedCount > 0 && (
        <Text color={colors.dimGray}>✓ {hiddenCompletedCount} completed</Text>
      )}
    </>
  );
}

// Todo row component
function TodoRow({ todo, maxWidth }: { todo: TodoItem; maxWidth: number }) {
  const statusIcon = {
    pending: <Text color={colors.dimGray}>{symbols.hollowDot}</Text>,
    in_progress: <Text color={colors.cyan}>{symbols.spinnerFrames[Math.floor(Date.now() / 120) % symbols.spinnerFrames.length]}</Text>,
    completed: <Text color={colors.success}>{symbols.check}</Text>,
    cancelled: <Text color={colors.dimGray}>⊘</Text>,
  }[todo.status];

  const textColor = {
    pending: colors.dimGray,
    in_progress: colors.white,
    completed: colors.gray,
    cancelled: colors.dimGray,
  }[todo.status];

  const truncatedContent = todo.content.length > maxWidth - 3
    ? todo.content.substring(0, maxWidth - 6) + '...'
    : todo.content;

  return (
    <Box>
      {statusIcon}
      <Text color={textColor}> {truncatedContent}</Text>
    </Box>
  );
}
