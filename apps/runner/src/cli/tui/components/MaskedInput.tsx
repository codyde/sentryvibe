import { useState, useEffect } from 'react';
import { Text, useInput } from 'ink';
import { colors } from '../theme.js';

interface MaskedInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maskChar?: string;
  focused?: boolean;
}

/**
 * Masked text input for sensitive data like keys/passwords
 * Shows mask characters (default: *) instead of actual value
 * Supports paste (multi-character input)
 */
export function MaskedInput({
  value,
  onChange,
  placeholder = '',
  maskChar = '*',
  focused = false,
}: MaskedInputProps) {
  const [cursorVisible, setCursorVisible] = useState(true);

  // Blink cursor when focused
  useEffect(() => {
    if (!focused) {
      setCursorVisible(false);
      return;
    }

    setCursorVisible(true);
    const interval = setInterval(() => {
      setCursorVisible(prev => !prev);
    }, 500);

    return () => clearInterval(interval);
  }, [focused]);

  useInput((input, key) => {
    if (!focused) return;

    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
    } else if (!key.escape && !key.return && !key.tab && 
               !key.upArrow && !key.downArrow && !key.leftArrow && !key.rightArrow) {
      // Allow any printable input including pasted text (multi-character)
      // Filter out control characters but allow regular text
      const printable = input.replace(/[\x00-\x1F\x7F]/g, '');
      if (printable.length > 0) {
        onChange(value + printable);
      }
    }
  }, { isActive: focused });

  const displayValue = value ? maskChar.repeat(value.length) : '';
  const cursor = focused && cursorVisible ? '│' : ' ';

  if (!value && !focused) {
    return (
      <Text color={colors.dimGray}>
        {placeholder}
      </Text>
    );
  }

  return (
    <Text color={colors.white}>
      {displayValue}
      {focused && <Text color={colors.cyan}>{cursor}</Text>}
    </Text>
  );
}
