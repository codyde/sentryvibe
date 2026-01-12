'use client';

import { useState, useEffect } from 'react';

interface ColorPickerProps {
  label: string;
  description?: string;
  value: string;
  onChange: (color: string) => void;
}

export default function ColorPicker({ label, description, value, onChange }: ColorPickerProps) {
  const [hexInput, setHexInput] = useState(value);

  // Sync with external value changes
  useEffect(() => {
    setHexInput(value);
  }, [value]);

  const handleHexChange = (input: string) => {
    setHexInput(input);

    // Validate and update parent only if valid hex
    const normalized = input.startsWith('#') ? input : `#${input}`;
    if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
      onChange(normalized.toUpperCase());
    } else if (/^#[0-9A-Fa-f]{3}$/.test(normalized)) {
      // Expand 3-digit hex to 6-digit
      const expanded = `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
      onChange(expanded.toUpperCase());
    }
  };

  const handleBlur = () => {
    // Reset to valid value on blur if invalid
    if (!hexInput.match(/^#[0-9A-Fa-f]{6}$/)) {
      setHexInput(value);
    }
  };

  return (
    <div className="space-y-2">
      <div>
        <label className="text-sm font-medium text-gray-200">{label}</label>
        {description && (
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Native color picker */}
        <input
          type="color"
          value={value}
          onChange={(e) => {
            const color = e.target.value.toUpperCase();
            onChange(color);
            setHexInput(color);
          }}
          className="w-12 h-12 rounded-md border border-white/10 cursor-pointer
                     bg-white/5 hover:border-white/20 transition-colors"
          style={{
            colorScheme: 'dark',
          }}
        />

        {/* Hex input */}
        <input
          type="text"
          value={hexInput}
          onChange={(e) => handleHexChange(e.target.value)}
          onBlur={handleBlur}
          placeholder="#FF6B6B"
          maxLength={7}
          className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-md
                     text-sm font-mono text-gray-200 focus:border-theme-primary focus:outline-none
                     transition-colors"
        />
      </div>
    </div>
  );
}
