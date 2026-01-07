import { useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { Banner, MaskedInput } from '../components/index.js';
import { colors } from '../theme.js';

export interface RunnerConfig {
  key: string;
  runnerId: string;
}

export interface RunnerModeScreenProps {
  initialKey?: string;
  initialRunnerId?: string;
  onStart: (config: RunnerConfig) => void;
  onEscape: () => void;
}

type FocusedField = 'key' | 'runnerId';

// Fixed label width for alignment
const LABEL_WIDTH = 14;

/**
 * Runner mode screen with key and runner ID inputs
 */
export function RunnerModeScreen({
  initialKey = '',
  initialRunnerId = '',
  onStart,
  onEscape,
}: RunnerModeScreenProps) {
  const { stdout } = useStdout();
  const [runnerId, setRunnerId] = useState(initialRunnerId);
  const [focusedField, setFocusedField] = useState<FocusedField>('key');
  
  // We need a separate state for the actual key value since MaskedInput doesn't use ink-text-input
  const [runnerKey, setRunnerKey] = useState(initialKey);
  
  // Calculate vertical centering
  const terminalHeight = stdout?.rows || 24;
  const contentHeight = 18;
  const topPadding = Math.max(0, Math.floor((terminalHeight - contentHeight) / 3));

  const isLastField = focusedField === 'runnerId';

  const handleSubmit = () => {
    if (runnerKey.trim()) {
      onStart({ key: runnerKey, runnerId: runnerId.trim() || initialRunnerId });
    }
  };

  useInput((input, key) => {
    if (key.escape) {
      onEscape();
      return;
    }

    // Shift+Enter to submit immediately from any field
    if (key.return && key.shift) {
      handleSubmit();
      return;
    }

    // Regular Enter moves to next field, or submits if on last field
    if (key.return && !key.shift) {
      if (isLastField) {
        handleSubmit();
      } else {
        setFocusedField('runnerId');
      }
      return;
    }

    if (key.tab || key.downArrow) {
      setFocusedField(prev => prev === 'key' ? 'runnerId' : 'key');
      return;
    }

    if (key.upArrow) {
      setFocusedField(prev => prev === 'runnerId' ? 'key' : 'runnerId');
      return;
    }
  });

  const handleKeyChange = (value: string) => {
    setRunnerKey(value);
  };

  return (
    <Box flexDirection="column" alignItems="center" paddingTop={topPadding}>
      {/* Banner */}
      <Banner />
      
      {/* Spacer */}
      <Box marginTop={1} />
      
      {/* Title */}
      <Text color={colors.purple} bold>Runner Mode</Text>
      
      {/* Spacer */}
      <Box marginTop={2} />
      
      {/* Form fields */}
      <Box flexDirection="column" gap={1}>
        {/* Runner Key (masked) */}
        <Box flexDirection="row" alignItems="center">
          <Box width={LABEL_WIDTH} justifyContent="flex-end" marginRight={1}>
            <Text color={focusedField === 'key' ? colors.cyan : colors.gray}>
              Runner Key
            </Text>
          </Box>
          <Box
            borderStyle="round"
            borderColor={focusedField === 'key' ? colors.cyan : colors.darkGray}
            paddingX={1}
            width={40}
          >
            <MaskedInput
              value={runnerKey}
              onChange={handleKeyChange}
              placeholder="Paste your runner key"
              focused={focusedField === 'key'}
            />
          </Box>
        </Box>
        
        {/* Auto-fill hint */}
        {initialKey && focusedField === 'key' && (
          <Box marginLeft={LABEL_WIDTH + 2}>
            <Text color={colors.dimGray} italic>
              (auto-filled from previous config)
            </Text>
          </Box>
        )}
        
        {/* Runner ID */}
        <Box flexDirection="row" alignItems="center">
          <Box width={LABEL_WIDTH} justifyContent="flex-end" marginRight={1}>
            <Text color={focusedField === 'runnerId' ? colors.cyan : colors.gray}>
              Runner ID
            </Text>
          </Box>
          <Box
            borderStyle="round"
            borderColor={focusedField === 'runnerId' ? colors.cyan : colors.darkGray}
            paddingX={1}
            width={40}
          >
            {focusedField === 'runnerId' ? (
              <TextInput
                value={runnerId}
                onChange={setRunnerId}
                placeholder={initialRunnerId || 'Enter runner ID'}
              />
            ) : (
              <Text color={runnerId ? colors.white : colors.dimGray}>
                {runnerId || initialRunnerId || 'Enter runner ID'}
              </Text>
            )}
          </Box>
        </Box>
      </Box>
      
      {/* Spacer */}
      <Box marginTop={3} />
      
      {/* Help text */}
      <Text color={colors.dimGray}>
        Enter: {isLastField ? 'Start runner' : 'Next field'} | Shift+Enter: Start now | Esc: Back
      </Text>
      
      {/* Validation message */}
      {!runnerKey.trim() && (
        <Box marginTop={1}>
          <Text color={colors.warning}>Runner key is required</Text>
        </Box>
      )}
    </Box>
  );
}
