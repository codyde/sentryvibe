import { Box, Text } from 'ink';
import { colors } from '../theme.js';

interface FormFieldProps {
  label: string;
  children: React.ReactNode;
  focused?: boolean;
  width?: number;
}

/**
 * Form field wrapper with consistent label styling
 * Label is vertically centered against the input box
 * 
 *   Label  ╭──────────────────────────╮
 *          │ value                    │
 *          ╰──────────────────────────╯
 */
export function FormField({ label, children, focused = false, width = 40 }: FormFieldProps) {
  return (
    <Box flexDirection="row" alignItems="center" marginY={0}>
      <Box width={14} justifyContent="flex-end" marginRight={1}>
        <Text color={focused ? colors.cyan : colors.gray}>
          {label}
        </Text>
      </Box>
      <Box
        borderStyle="round"
        borderColor={focused ? colors.cyan : colors.darkGray}
        width={width}
        paddingX={1}
      >
        {children}
      </Box>
    </Box>
  );
}
