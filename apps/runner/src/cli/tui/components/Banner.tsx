import { Box, Text } from 'ink';
import { colors } from '../theme.js';

/**
 * ASCII art banner component - centered with cyan/purple gradient
 */
export function Banner() {
  // Each line split at the SENTRY/VIBE boundary
  const lines = [
    { sentry: '███████╗███████╗███╗   ██╗████████╗██████╗ ██╗   ██╗', vibe: '██╗   ██╗██╗██████╗ ███████╗' },
    { sentry: '██╔════╝██╔════╝████╗  ██║╚══██╔══╝██╔══██╗╚██╗ ██╔╝', vibe: '██║   ██║██║██╔══██╗██╔════╝' },
    { sentry: '███████╗█████╗  ██╔██╗ ██║   ██║   ██████╔╝ ╚████╔╝ ', vibe: '██║   ██║██║██████╔╝█████╗' },
    { sentry: '╚════██║██╔══╝  ██║╚██╗██║   ██║   ██╔══██╗  ╚██╔╝  ', vibe: '╚██╗ ██╔╝██║██╔══██╗██╔══╝' },
    { sentry: '███████║███████╗██║ ╚████║   ██║   ██║  ██║   ██║   ', vibe: ' ╚████╔╝ ██║██████╔╝███████╗' },
    { sentry: '╚══════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝   ', vibe: '  ╚═══╝  ╚═╝╚═════╝ ╚══════╝' },
  ];

  return (
    <Box flexDirection="column" alignItems="center">
      {lines.map((line, index) => (
        <Box key={index}>
          <Text color={colors.cyan}>{line.sentry}</Text>
          <Text color={colors.brightPurple}>{line.vibe}</Text>
        </Box>
      ))}
    </Box>
  );
}
