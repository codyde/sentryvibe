/**
 * StatusBar - Bottom bar showing connection status and keyboard shortcuts
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
import { getVersionInfo } from '../../utils/version-info.js';

interface StatusBarProps {
  isConnected: boolean;
  isVerbose: boolean;
  buildCount?: number;
  currentBuildIndex?: number;
  view: 'dashboard' | 'fullLog' | 'copyMenu';
}

export function StatusBar({
  isConnected,
  isVerbose,
  buildCount = 0,
  currentBuildIndex = 0,
  view,
}: StatusBarProps) {
  // Get version info
  const versionInfo = getVersionInfo();
  
  // Connection indicator
  const connectionIndicator = (
    <Box marginRight={2}>
      <Text color={isConnected ? colors.success : colors.error}>
        {isConnected ? '●' : '○'}
      </Text>
      <Text color={colors.gray}>
        {' '}{isConnected ? 'Connected' : 'Disconnected'}
      </Text>
    </Box>
  );

  // Build count indicator (only show if multiple builds)
  const buildIndicator = buildCount > 1 ? (
    <Box marginRight={2}>
      <Text color={colors.gray}>
        Build {currentBuildIndex + 1}/{buildCount}
      </Text>
    </Box>
  ) : null;

  // Shortcuts based on current view
  const shortcuts = view === 'dashboard' ? (
    <Box>
      <Shortcut letter="q" label="quit" />
      <Shortcut letter="v" label={`verbose: ${isVerbose ? 'on' : 'off'}`} />
      <Shortcut letter="c" label="copy" />
      <Shortcut letter="t" label="text view" />
      {buildCount > 1 && <Shortcut letter="n/p" label="switch build" />}
      <Shortcut letter="↑↓" label="scroll" />
    </Box>
  ) : view === 'fullLog' ? (
    <Box>
      <Shortcut letter="t" label="dashboard" />
      <Shortcut letter="c" label="copy" />
      <Shortcut letter="/" label="search" />
      <Shortcut letter="f" label="filter" />
      <Shortcut letter="↑↓" label="scroll" />
      <Shortcut letter="PgUp/Dn" label="page" />
    </Box>
  ) : (
    <Box>
      <Shortcut letter="Esc" label="cancel" />
    </Box>
  );

  // Version display
  const versionDisplay = (
    <Box marginLeft={2}>
      <Text color={colors.dimGray}>
        {versionInfo.display}
      </Text>
    </Box>
  );

  return (
    <Box
      borderStyle="single"
      borderColor={colors.darkGray}
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        {connectionIndicator}
        {buildIndicator}
      </Box>
      <Box>
        {shortcuts}
        {versionDisplay}
      </Box>
    </Box>
  );
}

// Helper component for shortcuts
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
