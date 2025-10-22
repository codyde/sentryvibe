'use client';

import { PRESET_FONTS } from '@sentryvibe/agent-core/types/design';

interface FontSelectorProps {
  label: string;
  value: string;
  onChange: (font: string) => void;
  type: 'heading' | 'body';
}

export default function FontSelector({ label, value, onChange, type }: FontSelectorProps) {
  const fonts = PRESET_FONTS[type];

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-gray-200">{label}</label>

      {/* Font dropdown */}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md
                   text-sm text-gray-200 focus:border-purple-500 focus:outline-none
                   transition-colors cursor-pointer"
      >
        {fonts.map(font => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </select>

      {/* Live preview */}
      <div className="p-4 bg-white/5 rounded-md border border-white/10">
        <div
          className="text-gray-200"
          style={{
            fontFamily: value,
            fontSize: type === 'heading' ? '1.5rem' : '1rem',
            fontWeight: type === 'heading' ? 700 : 400,
            lineHeight: type === 'heading' ? 1.2 : 1.6,
          }}
        >
          {type === 'heading'
            ? 'The Quick Brown Fox'
            : 'The quick brown fox jumps over the lazy dog'}
        </div>
        <div className="text-xs text-gray-500 mt-2">
          Preview: {value}
        </div>
      </div>
    </div>
  );
}
