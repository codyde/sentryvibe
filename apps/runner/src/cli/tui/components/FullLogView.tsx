/**
 * FullLogView - Full-screen log view with search and filter
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { colors } from '../theme.js';
import type { LogEntry, LogLevel } from '../../../lib/logging/types.js';

type FilterMode = 'all' | 'errors' | 'tools' | 'verbose';

interface FullLogViewProps {
  entries: LogEntry[];
  onBack: () => void;
  onCopy: () => void;
}

export function FullLogView({ entries, onBack, onCopy }: FullLogViewProps) {
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows || 24;
  const terminalWidth = stdout?.columns || 80;

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [scrollOffset, setScrollOffset] = useState(0);
  const [searchMode, setSearchMode] = useState<'filter' | 'highlight'>('highlight');

  // Available height for log lines
  const headerHeight = 3;
  const footerHeight = 2;
  const visibleLines = Math.max(1, terminalHeight - headerHeight - footerHeight);

  // Filter and search entries
  const processedEntries = entries.filter(entry => {
    // Apply filter mode
    if (filterMode === 'errors' && entry.level !== 'error' && entry.level !== 'warn') {
      return false;
    }
    if (filterMode === 'tools' && !entry.toolName) {
      return false;
    }
    if (filterMode !== 'verbose' && entry.verbose) {
      return false;
    }

    // Apply search filter (if in filter mode)
    if (searchQuery && searchMode === 'filter') {
      const query = searchQuery.toLowerCase();
      const messageMatch = entry.message.toLowerCase().includes(query);
      const toolMatch = entry.toolName?.toLowerCase().includes(query);
      const argsMatch = entry.toolArgs?.toLowerCase().includes(query);
      return messageMatch || toolMatch || argsMatch;
    }

    return true;
  });

  // Calculate max scroll
  const maxScroll = Math.max(0, processedEntries.length - visibleLines);

  // Get visible entries
  const visibleEntries = processedEntries.slice(scrollOffset, scrollOffset + visibleLines);

  // Handle keyboard input
  useInput((input, key) => {
    if (isSearching) {
      if (key.escape || key.return) {
        setIsSearching(false);
      }
      return;
    }

    if (input === 't') {
      onBack();
    } else if (input === 'c') {
      onCopy();
    } else if (input === '/') {
      setIsSearching(true);
    } else if (input === 'f') {
      // Cycle through filter modes
      const modes: FilterMode[] = ['all', 'errors', 'tools', 'verbose'];
      const currentIndex = modes.indexOf(filterMode);
      setFilterMode(modes[(currentIndex + 1) % modes.length]);
      setScrollOffset(0);
    } else if (input === 'm') {
      // Toggle search mode
      setSearchMode(prev => prev === 'filter' ? 'highlight' : 'filter');
    } else if (key.upArrow) {
      setScrollOffset(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setScrollOffset(prev => Math.min(maxScroll, prev + 1));
    } else if (key.pageUp) {
      setScrollOffset(prev => Math.max(0, prev - visibleLines));
    } else if (key.pageDown) {
      setScrollOffset(prev => Math.min(maxScroll, prev + visibleLines));
    } else if (key.escape) {
      if (searchQuery) {
        setSearchQuery('');
      } else {
        onBack();
      }
    }
  });

  // Format time
  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Check if text matches search query
  const highlightSearch = (text: string): React.ReactNode => {
    if (!searchQuery || searchMode !== 'highlight') {
      return text;
    }

    const query = searchQuery.toLowerCase();
    const index = text.toLowerCase().indexOf(query);
    if (index === -1) {
      return text;
    }

    return (
      <>
        {text.slice(0, index)}
        <Text backgroundColor={colors.warning} color="black">
          {text.slice(index, index + searchQuery.length)}
        </Text>
        {text.slice(index + searchQuery.length)}
      </>
    );
  };

  return (
    <Box flexDirection="column" height={terminalHeight}>
      {/* Header with search */}
      <Box
        borderStyle="single"
        borderColor={colors.darkGray}
        paddingX={1}
        justifyContent="space-between"
      >
        <Text color={colors.cyan} bold>LOGS</Text>
        <Box>
          <Text color={colors.dimGray}>Search: </Text>
          {isSearching ? (
            <Box borderStyle="round" borderColor={colors.cyan} paddingX={1}>
              <TextInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="type to search..."
              />
            </Box>
          ) : (
            <Text color={searchQuery ? colors.white : colors.dimGray}>
              [{searchQuery || 'none'}] ({searchMode})
            </Text>
          )}
          <Text color={colors.dimGray}> [/]</Text>
        </Box>
      </Box>

      {/* Log content */}
      <Box
        flexDirection="column"
        flexGrow={1}
        borderStyle="single"
        borderColor={colors.darkGray}
        borderTop={false}
        borderBottom={false}
        paddingX={1}
      >
        {visibleEntries.map((entry, index) => {
          const time = formatTime(entry.timestamp);
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

          if (entry.toolName) {
            return (
              <Box key={entry.id}>
                <Text color={colors.dimGray}>{time}</Text>
                <Text color={colors.cyan}>   🔧 </Text>
                <Text color={colors.white}>{highlightSearch(entry.toolName)}</Text>
                {entry.toolArgs && (
                  <Text color={colors.gray}> {highlightSearch(entry.toolArgs)}</Text>
                )}
              </Box>
            );
          }

          return (
            <Box key={entry.id}>
              <Text color={colors.dimGray}>{time}</Text>
              <Text color={levelColors[entry.level]}> {levelIcons[entry.level]} </Text>
              <Text color={levelColors[entry.level]}>{highlightSearch(entry.message)}</Text>
            </Box>
          );
        })}
      </Box>

      {/* Footer with shortcuts and scroll position */}
      <Box
        borderStyle="single"
        borderColor={colors.darkGray}
        paddingX={1}
        justifyContent="space-between"
      >
        <Box>
          <Shortcut letter="t" label="dashboard" />
          <Shortcut letter="c" label="copy" />
          <Shortcut letter="/" label="search" />
          <Shortcut letter="f" label={`filter: ${filterMode}`} />
          <Shortcut letter="m" label={`mode: ${searchMode}`} />
        </Box>
        <Text color={colors.dimGray}>
          {scrollOffset + 1}-{Math.min(scrollOffset + visibleLines, processedEntries.length)}/{processedEntries.length}
        </Text>
      </Box>
    </Box>
  );
}

function Shortcut({ letter, label }: { letter: string; label: string }) {
  return (
    <Box marginRight={2}>
      <Text color={colors.dimGray}>[</Text>
      <Text color={colors.cyan}>{letter}</Text>
      <Text color={colors.dimGray}>]</Text>
      <Text color={colors.gray}>{label}</Text>
    </Box>
  );
}
