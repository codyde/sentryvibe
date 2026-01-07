import { Box, Text, useStdout } from 'ink';
import { Banner, HorizontalSelector, type CardOption } from '../components/index.js';
import { colors } from '../theme.js';

export type ModeSelection = 'local' | 'runner';

export interface ModeSelectScreenProps {
  onSelect: (mode: ModeSelection) => void;
  onEscape?: () => void;
}

const modeOptions: CardOption[] = [
  {
    id: 'local',
    title: 'Local Mode',
    description: 'Run SentryVibe on this machine',
  },
  {
    id: 'runner',
    title: 'Runner Mode',
    description: 'Connect to a remote server',
  },
];

/**
 * Initial mode selection screen
 * Shows two horizontal cards for Local Mode vs Runner Mode
 */
export function ModeSelectScreen({ onSelect, onEscape }: ModeSelectScreenProps) {
  const { stdout } = useStdout();
  
  // Calculate vertical centering
  const terminalHeight = stdout?.rows || 24;
  const contentHeight = 18;
  const topPadding = Math.max(0, Math.floor((terminalHeight - contentHeight) / 3));

  const handleSelect = (option: CardOption) => {
    onSelect(option.id as ModeSelection);
  };

  return (
    <Box flexDirection="column" alignItems="center" paddingTop={topPadding}>
      {/* Banner */}
      <Banner />
      
      {/* Spacer */}
      <Box marginTop={2} />
      
      {/* Horizontal card selector */}
      <HorizontalSelector
        options={modeOptions}
        onSelect={handleSelect}
        onEscape={onEscape}
      />
      
      {/* Spacer */}
      <Box marginTop={2} />
      
      {/* Help text */}
      <Text color={colors.dimGray}>
        Use {'<-'} {'->'} arrows to navigate, Enter to select, Esc to exit
      </Text>
    </Box>
  );
}
