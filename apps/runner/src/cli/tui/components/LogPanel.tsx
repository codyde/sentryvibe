/**
 * LogPanel - Right panel showing scrollable log entries
 * Takes up 80% of width, shows:
 * - Timestamped log entries
 * - Tool calls with truncated args
 * - Scrollable with keyboard navigation
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme.js';
import type { LogEntry } from '../../../lib/logging/types.js';

interface LogPanelProps {
  entries: LogEntry[];
  isVerbose: boolean;
  width: number;
  height: number;
  isFocused: boolean;
}

export function LogPanel({ entries, isVerbose, width, height, isFocused }: LogPanelProps) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);

  // Filter entries based on verbose mode
  const visibleEntries = isVerbose 
    ? entries 
    : entries.filter(e => !e.verbose);

  // Available height for log lines (subtract 2 for border, 1 for header)
  const visibleLines = Math.max(1, height - 3);

  // Auto-scroll when new entries arrive
  useEffect(() => {
    if (autoScroll && visibleEntries.length > 0) {
      const maxScroll = Math.max(0, visibleEntries.length - visibleLines);
      setScrollOffset(maxScroll);
    }
  }, [visibleEntries.length, autoScroll, visibleLines]);

  // Handle keyboard navigation
  useInput((input, key) => {
    if (!isFocused) return;

    if (key.upArrow) {
      setAutoScroll(false);
      setScrollOffset(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      const maxScroll = Math.max(0, visibleEntries.length - visibleLines);
      setScrollOffset(prev => Math.min(maxScroll, prev + 1));
      // Re-enable auto-scroll if we're at the bottom
      if (scrollOffset >= maxScroll - 1) {
        setAutoScroll(true);
      }
    } else if (key.pageUp) {
      setAutoScroll(false);
      setScrollOffset(prev => Math.max(0, prev - visibleLines));
    } else if (key.pageDown) {
      const maxScroll = Math.max(0, visibleEntries.length - visibleLines);
      setScrollOffset(prev => Math.min(maxScroll, prev + visibleLines));
    }
  });

  // Get visible slice of entries
  const displayedEntries = visibleEntries.slice(scrollOffset, scrollOffset + visibleLines);

  // Format time
  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor={isFocused ? colors.cyan : colors.darkGray}
      paddingX={1}
    >
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={0}>
        <Text color={colors.cyan} bold>LOGS</Text>
        <Text color={colors.dimGray}>
          [verbose: {isVerbose ? 'on' : 'off'}]
        </Text>
      </Box>

      {/* Log entries */}
      <Box flexDirection="column" flexGrow={1}>
        {displayedEntries.length === 0 ? (
          <Box justifyContent="center" alignItems="center" flexGrow={1}>
            <Text color={colors.dimGray}>Waiting for logs...</Text>
          </Box>
        ) : (
          displayedEntries.map((entry, index) => (
            <LogEntryRow 
              key={entry.id} 
              entry={entry} 
              maxWidth={width - 4}
            />
          ))
        )}
      </Box>

      {/* Scroll indicator */}
      {visibleEntries.length > visibleLines && (
        <Box justifyContent="flex-end">
          <Text color={colors.dimGray}>
            {scrollOffset + 1}-{Math.min(scrollOffset + visibleLines, visibleEntries.length)}/{visibleEntries.length}
            {autoScroll ? ' (auto)' : ''}
          </Text>
        </Box>
      )}
    </Box>
  );
}

// Individual log entry row
function LogEntryRow({ entry, maxWidth }: { entry: LogEntry; maxWidth: number }) {
  const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const levelColors = {
    debug: colors.dimGray,
    info: colors.cyan,
    success: colors.success,
    warn: colors.warning,
    error: colors.error,
  };

  const levelIcons = {
    debug: '  ',
    info: '●',
    success: '✓',
    warn: '⚠',
    error: '✗',
  };

  // Tool calls get special formatting
  if (entry.toolName) {
    const argsText = entry.toolArgs ? ` ${entry.toolArgs}` : '';
    const fullText = `${entry.toolName}${argsText}`;
    const truncated = fullText.length > maxWidth - 12 
      ? fullText.substring(0, maxWidth - 15) + '...'
      : fullText;

    return (
      <Box>
        <Text color={colors.dimGray}>{time}</Text>
        <Text color={colors.cyan}>   🔧 </Text>
        <Text color={colors.white}>{entry.toolName}</Text>
        {entry.toolArgs && <Text color={colors.gray}> {entry.toolArgs}</Text>}
      </Box>
    );
  }

  // Regular log entries
  const color = levelColors[entry.level];
  const icon = levelIcons[entry.level];
  
  // Truncate message if needed
  const availableWidth = maxWidth - 12; // time + space + icon + space
  const truncatedMessage = entry.message.length > availableWidth
    ? entry.message.substring(0, availableWidth - 3) + '...'
    : entry.message;

  return (
    <Box>
      <Text color={colors.dimGray}>{time}</Text>
      <Text color={color}> {icon} </Text>
      <Text color={color}>{truncatedMessage}</Text>
    </Box>
  );
}
