import { Box, Text } from 'ink';
import { colors } from '../theme.js';

interface VersionFooterProps {
  version: string;
  commit?: string | null;
}

/**
 * Version footer component - displays version and commit ID
 * Renders inline - parent component should position it appropriately
 */
export function VersionFooter({ version, commit }: VersionFooterProps) {
  // Format display string
  const display = commit ? `v${version} (${commit})` : `v${version}`;
  
  return (
    <Box justifyContent="flex-end" marginTop={1}>
      <Text color={colors.gray} dimColor>
        {display}
      </Text>
    </Box>
  );
}
