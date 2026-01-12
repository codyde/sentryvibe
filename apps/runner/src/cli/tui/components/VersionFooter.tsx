import { Box, Text, useStdout } from 'ink';
import { colors } from '../theme.js';

interface VersionFooterProps {
  version: string;
  commit?: string | null;
}

/**
 * Version footer component - displays version and commit ID in bottom right
 */
export function VersionFooter({ version, commit }: VersionFooterProps) {
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns || 80;
  
  // Format display string
  const display = commit ? `v${version} (${commit})` : `v${version}`;
  
  return (
    <Box 
      position="absolute" 
      bottom={0} 
      width={terminalWidth}
      justifyContent="flex-end"
      paddingRight={2}
    >
      <Text color={colors.gray} dimColor>
        {display}
      </Text>
    </Box>
  );
}
