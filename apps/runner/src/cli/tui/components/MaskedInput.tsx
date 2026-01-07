import { useState, useEffect, useRef, useCallback } from 'react';
import { Text, useInput } from 'ink';
import { colors } from '../theme.js';

interface MaskedInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maskChar?: string;
  focused?: boolean;
  visiblePrefixLength?: number; // Number of characters to show unmasked at the start
}

/**
 * Masked text input for sensitive data like keys/passwords
 * Shows first N characters (default: 5) then mask characters for the rest
 * Supports paste (multi-character input) with buffering to prevent visual glitches
 */
export function MaskedInput({
  value,
  onChange,
  placeholder = '',
  maskChar = '*',
  focused = false,
  visiblePrefixLength = 5,
}: MaskedInputProps) {
  const [cursorVisible, setCursorVisible] = useState(true);
  // Buffer to accumulate rapid input (for paste detection)
  const inputBufferRef = useRef<string>('');
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Keep current value in ref for use in timeout callbacks
  const valueRef = useRef(value);
  valueRef.current = value;

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

  // Flush buffered input - called after a brief delay to batch paste operations
  const flushBuffer = useCallback(() => {
    if (inputBufferRef.current) {
      onChange(valueRef.current + inputBufferRef.current);
      inputBufferRef.current = '';
    }
  }, [onChange]);

  useInput((input, key) => {
    if (!focused) return;

    if (key.backspace || key.delete) {
      // Clear any pending buffer on backspace
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }
      if (inputBufferRef.current) {
        // Remove from buffer first
        inputBufferRef.current = inputBufferRef.current.slice(0, -1);
        if (!inputBufferRef.current) {
          onChange(value.slice(0, -1));
        }
      } else {
        onChange(value.slice(0, -1));
      }
    } else if (!key.escape && !key.return && !key.tab && 
               !key.upArrow && !key.downArrow && !key.leftArrow && !key.rightArrow) {
      // Allow any printable input including pasted text (multi-character)
      // Filter out control characters but allow regular text
      const printable = input.replace(/[\x00-\x1F\x7F]/g, '');
      if (printable.length > 0) {
        // Buffer the input for batching (helps with paste)
        inputBufferRef.current += printable;
        
        // Clear any existing timeout
        if (flushTimeoutRef.current) {
          clearTimeout(flushTimeoutRef.current);
        }
        
        // Set a short timeout to flush - if more input comes quickly (paste), 
        // it will be batched together
        flushTimeoutRef.current = setTimeout(() => {
          flushBuffer();
          flushTimeoutRef.current = null;
        }, 10);
      }
    }
  }, { isActive: focused });

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }
    };
  }, []);

  // Show first N characters unmasked, mask the rest
  const getDisplayValue = () => {
    if (!value) return '';
    if (value.length <= visiblePrefixLength) {
      return value;
    }
    const visiblePart = value.substring(0, visiblePrefixLength);
    const maskedPart = maskChar.repeat(value.length - visiblePrefixLength);
    return visiblePart + maskedPart;
  };
  
  const displayValue = getDisplayValue();
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
