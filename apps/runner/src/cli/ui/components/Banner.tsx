/**
 * Banner Component - SentryVibe ASCII art banner for TUI
 * Part of the TUI rendering so it stays fixed at top
 */

import React from 'react';
import { Box, Text } from 'ink';

export function Banner() {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text><Text color="cyan">███████╗███████╗███╗   ██╗████████╗██████╗ ██╗   ██╗</Text><Text color="magenta">██╗   ██╗██╗██████╗ ███████╗</Text></Text>
      <Text><Text color="cyan">██╔════╝██╔════╝████╗  ██║╚══██╔══╝██╔══██╗╚██╗ ██╔╝</Text><Text color="magenta">██║   ██║██║██╔══██╗██╔════╝</Text></Text>
      <Text><Text color="cyan">███████╗█████╗  ██╔██╗ ██║   ██║   ██████╔╝ ╚████╔╝ </Text><Text color="magenta">██║   ██║██║██████╔╝█████╗</Text></Text>
      <Text><Text color="cyan">╚════██║██╔══╝  ██║╚██╗██║   ██║   ██╔══██╗  ╚██╔╝  </Text><Text color="magenta">╚██╗ ██╔╝██║██╔══██╗██╔══╝</Text></Text>
      <Text><Text color="cyan">███████║███████╗██║ ╚████║   ██║   ██║  ██║   ██║    </Text><Text color="magenta">╚████╔╝ ██║██████╔╝███████╗</Text></Text>
      <Text><Text color="cyan">╚══════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝     </Text><Text color="magenta">╚═══╝  ╚═╝╚═════╝ ╚══════╝</Text></Text>
    </Box>
  );
}
