import { useState } from 'react';
import { Box, Text, useApp, useStdout } from 'ink';
import { Banner, Menu, type MenuItem } from '../components/index.js';
import { colors } from '../theme.js';

export type MenuAction = 'init' | 'start' | 'exit';

export interface MainMenuScreenProps {
  isInitialized: boolean;
  hasRunnerKey: boolean;
  onSelect: (action: MenuAction) => void;
}

/**
 * Main menu screen - shown when running `sentryvibe` without args
 */
export function MainMenuScreen({ isInitialized, hasRunnerKey, onSelect }: MainMenuScreenProps) {
  const { stdout } = useStdout();
  
  // Calculate vertical centering
  const terminalHeight = stdout?.rows || 24;
  const contentHeight = 16;
  const topPadding = Math.max(0, Math.floor((terminalHeight - contentHeight) / 3));

  // Build menu items based on state
  const menuItems: MenuItem[] = [];
  
  if (!isInitialized) {
    menuItems.push({
      id: 'init',
      label: 'Initialize SentryVibe',
      description: 'Set up workspace and configuration',
    });
  } else {
    menuItems.push({
      id: 'init',
      label: 'Reinitialize SentryVibe',
      description: 'Reset and reconfigure',
    });
  }

  menuItems.push({
    id: 'start',
    label: 'Start SentryVibe',
    description: isInitialized ? 'Launch the full stack' : 'Requires initialization first',
  });

  menuItems.push({
    id: 'exit',
    label: 'Exit',
  });

  const handleSelect = (item: MenuItem) => {
    onSelect(item.id as MenuAction);
  };

  return (
    <Box flexDirection="column" alignItems="center" paddingTop={topPadding}>
      {/* Banner */}
      <Banner />
      
      {/* Spacer */}
      <Box marginTop={2} />
      
      {/* Status indicator */}
      {isInitialized ? (
        <Text color={colors.success}>● Configured</Text>
      ) : (
        <Text color={colors.warning}>○ Not configured</Text>
      )}
      
      {/* Spacer */}
      <Box marginTop={2} />
      
      {/* Menu */}
      <Menu items={menuItems} onSelect={handleSelect} />
      
      {/* Spacer */}
      <Box marginTop={2} />
      
      {/* Help text */}
      <Text color={colors.dimGray}>
        Use ↑↓ arrows to navigate, Enter to select
      </Text>
    </Box>
  );
}
