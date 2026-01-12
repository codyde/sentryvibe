/**
 * BuildErrorView - Full-screen scrollable view for build errors
 * with copy functionality and exit handling
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import { colors, symbols } from '../theme.js';

interface BuildErrorViewProps {
  /** Error title/message */
  title: string;
  /** Array of error lines to display */
  errorLines: string[];
  /** Suggestions for fixing the error */
  suggestions?: string[];
  /** Callback when user exits */
  onExit?: () => void;
}

/**
 * Full-screen build error viewer with scrolling and copy support
 */
export function BuildErrorView({ 
  title, 
  errorLines, 
  suggestions = [],
  onExit 
}: BuildErrorViewProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows || 24;
  const terminalWidth = stdout?.columns || 80;

  const [scrollOffset, setScrollOffset] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showCopiedMessage, setShowCopiedMessage] = useState(false);

  // Calculate available space
  const headerHeight = 4;  // Title + separator + spacing
  const footerHeight = 4;  // Shortcuts + spacing
  const suggestionsHeight = suggestions.length > 0 ? suggestions.length + 2 : 0;
  const availableHeight = Math.max(5, terminalHeight - headerHeight - footerHeight - suggestionsHeight);

  // Calculate max scroll
  const maxScroll = Math.max(0, errorLines.length - availableHeight);

  // Get visible lines
  const visibleLines = errorLines.slice(scrollOffset, scrollOffset + availableHeight);

  // Copy all error content to clipboard
  const copyToClipboard = useCallback(async () => {
    const content = [
      `Build Error: ${title}`,
      '─'.repeat(60),
      ...errorLines,
      '─'.repeat(60),
      '',
      ...suggestions,
    ].join('\n');

    try {
      // Use native clipboard via child process (works in terminal)
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Detect platform and use appropriate clipboard command
      const platform = process.platform;
      let clipboardCmd: string;

      if (platform === 'darwin') {
        clipboardCmd = 'pbcopy';
      } else if (platform === 'win32') {
        clipboardCmd = 'clip';
      } else {
        // Linux - try xclip first, fall back to xsel
        clipboardCmd = 'xclip -selection clipboard';
      }

      // Write to clipboard
      const child = exec(clipboardCmd);
      child.stdin?.write(content);
      child.stdin?.end();

      setCopied(true);
      setShowCopiedMessage(true);

      // Show success message then exit after delay
      setTimeout(() => {
        if (onExit) {
          onExit();
        } else {
          exit();
        }
      }, 1500);
    } catch (error) {
      // Clipboard failed - just show the message without exiting
      console.error('Failed to copy to clipboard:', error);
    }
  }, [title, errorLines, suggestions, onExit, exit]);

  // Handle keyboard input
  useInput((input, key) => {
    if (input === 'c' || input === 'C') {
      copyToClipboard();
    } else if (key.upArrow) {
      setScrollOffset(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setScrollOffset(prev => Math.min(maxScroll, prev + 1));
    } else if (key.pageUp) {
      setScrollOffset(prev => Math.max(0, prev - availableHeight));
    } else if (key.pageDown) {
      setScrollOffset(prev => Math.min(maxScroll, prev + availableHeight));
    } else if (input === 'q' || key.escape) {
      if (onExit) {
        onExit();
      } else {
        exit();
      }
    }
  });

  // Color error lines based on content
  const getLineColor = (line: string): string => {
    if (/error|Error|ERR!/i.test(line)) return colors.error;
    if (/warning|warn/i.test(line)) return colors.warning;
    if (/:\d+:\d+/.test(line)) return colors.cyan; // File paths with line numbers
    if (line.startsWith('─')) return colors.dimGray;
    return colors.gray;
  };

  return (
    <Box flexDirection="column" height={terminalHeight} width={terminalWidth}>
      {/* Header */}
      <Box 
        flexDirection="column" 
        borderStyle="single" 
        borderColor={colors.error}
        paddingX={1}
      >
        <Box justifyContent="space-between">
          <Text color={colors.error} bold>
            {symbols.cross} {title}
          </Text>
          {errorLines.length > availableHeight && (
            <Text color={colors.dimGray}>
              [{scrollOffset + 1}-{Math.min(scrollOffset + availableHeight, errorLines.length)}/{errorLines.length}]
            </Text>
          )}
        </Box>
      </Box>

      {/* Error content - scrollable */}
      <Box 
        flexDirection="column" 
        borderStyle="single" 
        borderColor={colors.darkGray}
        borderTop={false}
        paddingX={1}
        height={availableHeight + 2}
        overflow="hidden"
      >
        {visibleLines.length > 0 ? (
          visibleLines.map((line, index) => (
            <Text key={index} color={getLineColor(line)} wrap="truncate">
              {line.length > terminalWidth - 4 ? line.substring(0, terminalWidth - 7) + '...' : line}
            </Text>
          ))
        ) : (
          <Text color={colors.dimGray}>No error details captured</Text>
        )}
      </Box>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <Box 
          flexDirection="column" 
          borderStyle="single" 
          borderColor={colors.darkGray}
          borderTop={false}
          paddingX={1}
        >
          <Text color={colors.gray} bold>Suggestions:</Text>
          {suggestions.map((suggestion, index) => (
            <Text key={index} color={suggestion.startsWith('  ') ? colors.cyan : colors.gray}>
              {suggestion}
            </Text>
          ))}
        </Box>
      )}

      {/* Footer with shortcuts */}
      <Box 
        borderStyle="single" 
        borderColor={colors.darkGray}
        borderTop={false}
        paddingX={1}
        justifyContent="space-between"
      >
        {showCopiedMessage ? (
          <Text color={colors.success} bold>
            {symbols.check} Copied to clipboard! Exiting...
          </Text>
        ) : (
          <Box>
            <Shortcut letter="c" label="copy & exit" highlight />
            <Shortcut letter="q" label="quit" />
            <Shortcut letter="↑↓" label="scroll" />
            <Shortcut letter="PgUp/Dn" label="page" />
          </Box>
        )}
      </Box>
    </Box>
  );
}

function Shortcut({ 
  letter, 
  label, 
  highlight = false 
}: { 
  letter: string; 
  label: string; 
  highlight?: boolean;
}) {
  return (
    <Box marginRight={2}>
      <Text color={colors.dimGray}>[</Text>
      <Text color={highlight ? colors.success : colors.cyan} bold={highlight}>{letter}</Text>
      <Text color={colors.dimGray}>]</Text>
      <Text color={highlight ? colors.success : colors.gray}>{label}</Text>
    </Box>
  );
}
