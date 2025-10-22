'use client';

import { MOOD_OPTIONS } from '@sentryvibe/agent-core/types/design';

interface MoodSelectorProps {
  selected: string[];
  onChange: (moods: string[]) => void;
  maxSelections?: number;
}

export default function MoodSelector({
  selected,
  onChange,
  maxSelections = 4
}: MoodSelectorProps) {
  const toggleMood = (mood: string) => {
    if (selected.includes(mood)) {
      onChange(selected.filter(m => m !== mood));
    } else if (selected.length < maxSelections) {
      onChange([...selected, mood]);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200">Style & Mood</h3>
        <span className="text-xs text-gray-400">
          {selected.length}/{maxSelections}
        </span>
      </div>

      <p className="text-xs text-gray-400">
        Select 2-4 descriptors for your design aesthetic
      </p>

      <div className="flex flex-wrap gap-1.5">
        {MOOD_OPTIONS.map(mood => {
          const isSelected = selected.includes(mood);
          const isDisabled = !isSelected && selected.length >= maxSelections;

          return (
            <button
              key={mood}
              onClick={() => toggleMood(mood)}
              disabled={isDisabled}
              className={`
                px-2.5 py-1 rounded-md text-xs font-medium transition-all border
                ${isSelected
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500'
                  : isDisabled
                    ? 'bg-white/5 text-gray-600 border-white/5 cursor-not-allowed opacity-50'
                    : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-gray-200 hover:border-white/20'
                }
              `}
            >
              {mood}
            </button>
          );
        })}
      </div>

      {selected.length < 2 && (
        <p className="text-xs text-yellow-400/80">
          Select at least 2 moods
        </p>
      )}
    </div>
  );
}
