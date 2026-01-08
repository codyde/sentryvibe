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
          {build.todos.slice(0, 6).map((todo, index) => (
            <TodoRow key={todo.id} todo={todo} maxWidth={width - 6} />
          ))}
          {build.todos.length > 6 && (
            <Text color={colors.dimGray}>+{build.todos.length - 6} more</Text>
          )}
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
