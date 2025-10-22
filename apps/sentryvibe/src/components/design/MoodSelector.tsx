'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { MOOD_OPTIONS } from '@sentryvibe/agent-core/types/design';
import { Button } from '../ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '../ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import { useState } from 'react';

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
  const [open, setOpen] = useState(false);

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

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between text-sm h-auto min-h-[2.5rem] bg-white/5 border-white/10 hover:bg-white/10 text-gray-200"
          >
            <span className="flex flex-wrap gap-1">
              {selected.length === 0 ? (
                <span className="text-gray-400">Select moods...</span>
              ) : (
                selected.map(mood => (
                  <span key={mood} className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-xs">
                    {mood}
                  </span>
                ))
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 text-gray-400" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0 bg-[#1e1e1e] border-[#3e3e3e]" align="start">
          <Command className="bg-[#1e1e1e]">
            <CommandInput placeholder="Search moods..." className="text-gray-200 bg-white/5 border-white/10" />
            <CommandEmpty className="text-gray-400">No mood found.</CommandEmpty>
            <CommandGroup className="max-h-64 overflow-auto">
              {MOOD_OPTIONS.map((mood) => {
                const isSelected = selected.includes(mood);
                const isDisabled = !isSelected && selected.length >= maxSelections;

                return (
                  <CommandItem
                    key={mood}
                    value={mood}
                    onSelect={() => {
                      if (!isDisabled) {
                        toggleMood(mood);
                      }
                    }}
                    disabled={isDisabled}
                    className="cursor-pointer text-gray-200 aria-selected:bg-purple-500/20 aria-selected:text-purple-300"
                  >
                    <Check
                      className={`mr-2 h-4 w-4 ${
                        isSelected ? 'opacity-100 text-purple-300' : 'opacity-0'
                      }`}
                    />
                    {mood}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length < 2 && (
        <p className="text-xs text-yellow-400/80">
          Select at least 2 moods
        </p>
      )}
    </div>
  );
}
