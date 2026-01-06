import { Box, Text, useInput } from 'ink';
import { colors, symbols } from '../theme.js';

export interface RadioOption {
  id: string;
  label: string;
}

interface RadioGroupProps {
  options: RadioOption[];
  selected: string;
  onChange: (id: string) => void;
  focused?: boolean;
}

/**
 * Radio button group component
 * 
 *   ● Option 1
 *   ○ Option 2
 */
export function RadioGroup({ options, selected, onChange, focused = false }: RadioGroupProps) {
  useInput((input, key) => {
    if (!focused) return;

    const currentIndex = options.findIndex(opt => opt.id === selected);
    
    if (key.upArrow) {
      const newIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1;
      onChange(options[newIndex].id);
    } else if (key.downArrow) {
      const newIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0;
      onChange(options[newIndex].id);
    } else if (input === ' ') {
      // Space toggles current selection (useful for single option scenarios)
      // For radio groups, this just confirms current selection
    }
  }, { isActive: focused });

  return (
    <Box flexDirection="column">
      {options.map((option) => {
        const isSelected = option.id === selected;
        const isFocusedOption = focused && isSelected;
        
        return (
          <Box key={option.id} marginY={0}>
            <Text color={isSelected ? colors.cyan : colors.gray}>
              {isSelected ? symbols.filledDot : symbols.hollowDot}
            </Text>
            <Text> </Text>
            <Text
              color={isFocusedOption ? colors.white : (isSelected ? colors.gray : colors.dimGray)}
              bold={isFocusedOption}
            >
              {option.label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
