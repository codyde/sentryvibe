import { Box, Text } from 'ink';
import { colors } from '../theme.js';

/**
 * ASCII art banner component - centered with cyan/purple gradient
 * Each line is padded to exactly the same width for perfect alignment
 */
export function Banner() {
  // Full banner lines - OPEN in cyan, BUILDER in purple
  // All lines padded to same total width for consistent centering
  const lines = [
    { ship: '███████╗██╗  ██╗██╗██████╗ ', builder: '██████╗ ██╗   ██╗██╗██╗     ██████╗ ███████╗██████╗ ' },
    { ship: '██╔════╝██║  ██║██║██╔══██╗', builder: '██╔══██╗██║   ██║██║██║     ██╔══██╗██╔════╝██╔══██╗' },
    { ship: '███████╗███████║██║██████╔╝', builder: '██████╔╝██║   ██║██║██║     ██║  ██║█████╗  ██████╔╝' },
    { ship: '╚════██║██╔══██║██║██╔═══╝ ', builder: '██╔══██╗██║   ██║██║██║     ██║  ██║██╔══╝  ██╔══██╗' },
    { ship: '███████║██║  ██║██║██║     ', builder: '██████╔╝╚██████╔╝██║███████╗██████╔╝███████╗██║  ██║' },
    { ship: '╚══════╝╚═╝  ╚═╝╚═╝╚═╝     ', builder: '╚═════╝  ╚═════╝ ╚═╝╚══════╝╚═════╝ ╚══════╝╚═╝  ╚═╝' },
  ];

  return (
    <Box flexDirection="column" alignItems="center">
      {lines.map((line, index) => (
        <Box key={index}>
          <Text color={colors.cyan}>{line.ship}</Text>
          <Text color={colors.brightPurple}>{line.builder}</Text>
        </Box>
      ))}
    </Box>
  );
}
