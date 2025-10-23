'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ColorPickerTagProps {
  label: string;
  description: string;
  initialValue?: string;
  onApply: (value: string) => void;
  onCancel: () => void;
}

export function ColorPickerTag({
  label,
  description,
  initialValue = '#6366f1',
  onApply,
  onCancel
}: ColorPickerTagProps) {
  const [color, setColor] = useState(initialValue);
  const [hexInput, setHexInput] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  const validateAndSetHex = (value: string) => {
    setHexInput(value);

    // Allow partial input while typing
    if (!value.startsWith('#')) {
      value = '#' + value;
    }

    // Validate hex format
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (hexRegex.test(value)) {
      setColor(value);
      setError(null);
    } else if (value.length === 1) {
      // Just the '#', valid so far
      setError(null);
    } else {
      setError('Invalid hex color format');
    }
  };

  const handleApply = () => {
    // Validate before applying
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!hexRegex.test(color)) {
      setError('Please enter a valid hex color');
      return;
    }
    onApply(color);
  };

  return (
    <div className="p-3 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-200">{label}</h3>
        <p className="text-xs text-gray-400 mt-1">{description}</p>
      </div>

      <div className="flex items-center gap-2">
        {/* Native color picker */}
        <div className="relative flex-shrink-0">
          <input
            type="color"
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              setHexInput(e.target.value);
              setError(null);
            }}
            className="w-10 h-10 rounded border-2 border-gray-700 cursor-pointer bg-gray-800"
            style={{
              colorScheme: 'dark'
            }}
          />
        </div>

        {/* Hex input */}
        <div className="flex-1 min-w-0">
          <Input
            value={hexInput}
            onChange={(e) => validateAndSetHex(e.target.value)}
            placeholder="#6366f1"
            className="font-mono bg-gray-800 border-gray-700 text-sm"
          />
          {error && (
            <p className="text-xs text-red-400 mt-1">{error}</p>
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="p-3 rounded bg-gray-800 border border-gray-700">
        <div className="flex items-center gap-2">
          <div
            className="w-12 h-12 rounded border-2 border-gray-600 flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-200">Preview</p>
            <p className="text-xs font-mono text-gray-400">{color}</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="bg-gray-800 border-gray-700 hover:bg-gray-700"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleApply}
          disabled={!!error}
          className="bg-purple-600 hover:bg-purple-700"
        >
          Apply Tag
        </Button>
      </div>
    </div>
  );
}
