'use client';

import { useState, useEffect } from 'react';
import type { DesignPreferences } from '@sentryvibe/agent-core/types/design';
import { DEFAULT_DESIGN_PREFERENCES } from '@sentryvibe/agent-core/types/design';
import ColorPicker from './ColorPicker';
import FontSelector from './FontSelector';
import MoodSelector from './MoodSelector';
import LivePreview from './LivePreview';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface DesignConstraintsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPreferences: DesignPreferences | null;
  onApply: (preferences: DesignPreferences) => void;
}

export default function DesignConstraintsModal({
  isOpen,
  onClose,
  currentPreferences,
  onApply,
}: DesignConstraintsModalProps) {
  const [colors, setColors] = useState(
    currentPreferences?.colors || DEFAULT_DESIGN_PREFERENCES.colors
  );
  const [typography, setTypography] = useState(
    currentPreferences?.typography || DEFAULT_DESIGN_PREFERENCES.typography
  );
  const [mood, setMood] = useState(
    currentPreferences?.mood || DEFAULT_DESIGN_PREFERENCES.mood
  );
  const [colorMode, setColorMode] = useState<'light' | 'dark'>('light');

  // Reset form when currentPreferences changes
  useEffect(() => {
    if (currentPreferences) {
      setColors(currentPreferences.colors);
      setTypography(currentPreferences.typography);
      setMood(currentPreferences.mood);
    }
  }, [currentPreferences]);

  const handleApply = () => {
    onApply({
      colors,
      typography,
      mood,
      version: 1,
    });
    onClose();
  };

  const handleReset = () => {
    setColors(DEFAULT_DESIGN_PREFERENCES.colors);
    setTypography(DEFAULT_DESIGN_PREFERENCES.typography);
    setMood(DEFAULT_DESIGN_PREFERENCES.mood);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[80vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Design Constraints</DialogTitle>
          <DialogDescription>
            Define your design preferences for consistent, on-brand builds
          </DialogDescription>
        </DialogHeader>

        {/* Two-column layout: Controls left, Preview right */}
        <div className="grid grid-cols-[1fr,350px] gap-6 px-6 pb-4 overflow-hidden">
          {/* Left Column - Controls */}
          <div className="overflow-y-auto pr-4 space-y-6 max-h-[calc(80vh-200px)]">
            {/* Colors */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-200">Color Palette</h3>
              <div className="grid grid-cols-2 gap-3">
                <ColorPicker
                  label="Primary"
                  description="CTAs, buttons"
                  value={colors.primary}
                  onChange={(c) => setColors({ ...colors, primary: c })}
                />
                <ColorPicker
                  label="Secondary"
                  description="Secondary actions"
                  value={colors.secondary}
                  onChange={(c) => setColors({ ...colors, secondary: c })}
                />
                <ColorPicker
                  label="Accent"
                  description="Highlights, badges"
                  value={colors.accent}
                  onChange={(c) => setColors({ ...colors, accent: c })}
                />
                <ColorPicker
                  label="Neutral Light"
                  description="Light backgrounds"
                  value={colors.neutralLight}
                  onChange={(c) => setColors({ ...colors, neutralLight: c })}
                />
                <ColorPicker
                  label="Neutral Dark"
                  description="Text, dark backgrounds"
                  value={colors.neutralDark}
                  onChange={(c) => setColors({ ...colors, neutralDark: c })}
                />
              </div>
            </div>

            {/* Typography */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-200">Typography</h3>
              <div className="grid grid-cols-2 gap-3">
                <FontSelector
                  label="Heading Font"
                  value={typography.heading}
                  onChange={(f) => setTypography({ ...typography, heading: f })}
                  type="heading"
                />
                <FontSelector
                  label="Body Font"
                  value={typography.body}
                  onChange={(f) => setTypography({ ...typography, body: f })}
                  type="body"
                />
              </div>
            </div>

            {/* Mood */}
            <MoodSelector selected={mood} onChange={setMood} maxSelections={4} />
          </div>

          {/* Right Column - Preview */}
          <div className="flex flex-col space-y-3 border-l border-white/10 pl-6">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-400">Preview</label>
              <div className="flex gap-1 bg-white/5 border border-white/10 rounded p-0.5">
                <button
                  onClick={() => setColorMode('light')}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    colorMode === 'light'
                      ? 'bg-white/10 text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Light
                </button>
                <button
                  onClick={() => setColorMode('dark')}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    colorMode === 'dark'
                      ? 'bg-white/10 text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Dark
                </button>
              </div>
            </div>

            <LivePreview colors={colors} typography={typography} colorMode={colorMode} />
          </div>
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button variant="outline" onClick={handleReset}>
            Reset
          </Button>
          <Button onClick={handleApply} className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border-purple-500/50">
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
