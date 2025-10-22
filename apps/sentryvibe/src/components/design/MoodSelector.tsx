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
        <label className="text-sm font-medium text-gray-200">
          Style & Mood
        </label>
        <span className="text-xs text-gray-400">
          {selected.length}/{maxSelections} selected
        </span>
      </div>

      <p className="text-xs text-gray-400">
        Select 2-4 words describing your desired aesthetic
      </p>

      <div className="flex flex-wrap gap-2">
        {MOOD_OPTIONS.map(mood => {
          const isSelected = selected.includes(mood);
          const isDisabled = !isSelected && selected.length >= maxSelections;

          return (
            <button
              key={mood}
              onClick={() => toggleMood(mood)}
              disabled={isDisabled}
              className={`
                px-3 py-1.5 rounded-full text-sm transition-all
                ${isSelected
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500'
                  : isDisabled
                    ? 'bg-white/5 text-gray-600 border border-white/5 cursor-not-allowed opacity-50'
                    : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-gray-200 hover:border-white/20'
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
          Select at least 2 moods for best results
        </p>
      )}
    </div>
  );
}
