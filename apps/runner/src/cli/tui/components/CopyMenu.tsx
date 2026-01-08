/**
 * CopyMenu - Modal for copying logs to clipboard
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme.js';

interface CopyMenuProps {
  onSelect: (option: 'visible' | 'last50' | 'last100' | 'all' | 'range') => void;
  onCancel: () => void;
  visibleCount: number;
  totalCount: number;
}

export function CopyMenu({ onSelect, onCancel, visibleCount, totalCount }: CopyMenuProps) {
  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    } else if (input === '1') {
      onSelect('visible');
    } else if (input === '2') {
      onSelect('last50');
    } else if (input === '3') {
      onSelect('last100');
    } else if (input === '4') {
      onSelect('all');
    } else if (input === '5') {
      onSelect('range');
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.cyan}
      paddingX={2}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text color={colors.cyan} bold>Copy Logs</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <CopyOption number="1" label={`Copy visible (${visibleCount} lines)`} />
        <CopyOption number="2" label="Copy last 50 lines" />
        <CopyOption number="3" label="Copy last 100 lines" />
        <CopyOption number="4" label={`Copy all from file (${totalCount} lines)`} />
        <CopyOption number="5" label="Copy range..." />
      </Box>

      <Box>
        <Text color={colors.dimGray}>[Esc] Cancel</Text>
      </Box>
    </Box>
  );
}

function CopyOption({ number, label }: { number: string; label: string }) {
  return (
    <Box>
      <Text color={colors.dimGray}>[</Text>
      <Text color={colors.cyan}>{number}</Text>
      <Text color={colors.dimGray}>]</Text>
      <Text color={colors.white}> {label}</Text>
    </Box>
  );
}
