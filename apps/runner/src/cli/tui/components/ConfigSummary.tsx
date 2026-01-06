import { Box, Text } from 'ink';
import { colors, symbols } from '../theme.js';

export interface ConfigItem {
  label: string;
  value: string;
}

interface ConfigSummaryProps {
  items: ConfigItem[];
  title?: string;
}

/**
 * Configuration summary display
 * ───────────────────────────────────
 *  Workspace   ~/sentryvibe-workspace
 *  Server      http://localhost:3000
 *  Runner      local
 * ───────────────────────────────────
 */
export function ConfigSummary({ items, title }: ConfigSummaryProps) {
  const dividerWidth = 40;
  const divider = symbols.horizontalLine.repeat(dividerWidth);
  
  // Find the longest label for alignment
  const maxLabelLength = Math.max(...items.map(item => item.label.length));

  return (
    <Box flexDirection="column" alignItems="center">
      <Text color={colors.dimGray}>{divider}</Text>
      
      {title && (
        <Box marginTop={1} marginBottom={1}>
          <Text color={colors.white} bold>{title}</Text>
        </Box>
      )}
      
      <Box flexDirection="column" alignItems="flex-start" marginTop={title ? 0 : 1}>
        {items.map((item, index) => (
          <Box key={index}>
            <Text color={colors.gray}>
              {item.label.padEnd(maxLabelLength + 3)}
            </Text>
            <Text color={colors.cyan}>{item.value}</Text>
          </Box>
        ))}
      </Box>
      
      <Box marginTop={1}>
        <Text color={colors.dimGray}>{divider}</Text>
      </Box>
    </Box>
  );
}

interface NextStepsProps {
  command: string;
  url: string;
}

/**
 * Next steps display for completion screen
 */
export function NextSteps({ command, url }: NextStepsProps) {
  return (
    <Box flexDirection="column" alignItems="center" marginTop={1}>
      <Box>
        <Text color={colors.gray}>Run:  </Text>
        <Text color={colors.cyan} bold>{command}</Text>
      </Box>
      <Box>
        <Text color={colors.gray}>Open: </Text>
        <Text color={colors.cyan}>{url}</Text>
      </Box>
    </Box>
  );
}

interface ErrorSummaryProps {
  suggestions: string[];
}

/**
 * Error recovery suggestions
 */
export function ErrorSummary({ suggestions }: ErrorSummaryProps) {
  const dividerWidth = 40;
  const divider = symbols.horizontalLine.repeat(dividerWidth);

  return (
    <Box flexDirection="column" alignItems="center">
      <Text color={colors.dimGray}>{divider}</Text>
      
      <Box flexDirection="column" alignItems="flex-start" marginTop={1}>
        {suggestions.map((suggestion, index) => (
          <Box key={index}>
            <Text color={colors.gray}>{suggestion}</Text>
          </Box>
        ))}
      </Box>
      
      <Box marginTop={1}>
        <Text color={colors.dimGray}>{divider}</Text>
      </Box>
    </Box>
  );
}
