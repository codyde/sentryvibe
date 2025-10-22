'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import type { DesignPreferences } from '@sentryvibe/agent-core/types/design';
import { DEFAULT_DESIGN_PREFERENCES } from '@sentryvibe/agent-core/types/design';
import ColorPicker from './ColorPicker';
import FontSelector from './FontSelector';
import MoodSelector from './MoodSelector';
import LivePreview from './LivePreview';
import { Button } from '../ui/button';

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
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="bg-[#1e1e1e] border border-[#3e3e3e] rounded-xl shadow-2xl
                         w-full max-w-5xl max-h-[85vh] overflow-hidden pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Design Constraints</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Define your design preferences for consistent, on-brand builds
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Content - Two Column Layout */}
              <div className="grid grid-cols-[1fr,400px] gap-6 p-6 overflow-hidden max-h-[calc(85vh-140px)]">
                {/* Left Column - Controls (scrollable) */}
                <div className="overflow-y-auto pr-4 space-y-8">
                  {/* Colors Section */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-200">Color Palette</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <ColorPicker
                        label="Primary"
                        description="Main brand color for CTAs, buttons"
                        value={colors.primary}
                        onChange={(c) => setColors({ ...colors, primary: c })}
                      />
                      <ColorPicker
                        label="Secondary"
                        description="Supporting color for secondary actions"
                        value={colors.secondary}
                        onChange={(c) => setColors({ ...colors, secondary: c })}
                      />
                      <ColorPicker
                        label="Accent"
                        description="Highlights, badges, important elements"
                        value={colors.accent}
                        onChange={(c) => setColors({ ...colors, accent: c })}
                      />
                      <ColorPicker
                        label="Neutral Light"
                        description="Light backgrounds, cards"
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

                  {/* Typography Section */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-200">Typography</h3>
                    <div className="grid grid-cols-2 gap-4">
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

                  {/* Mood Section */}
                  <MoodSelector
                    selected={mood}
                    onChange={setMood}
                    maxSelections={4}
                  />
                </div>

                {/* Right Column - Preview (fixed) */}
                <div className="flex flex-col space-y-4">
                  {/* Mode Toggle */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-200">Preview Mode</label>
                    <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
                      <button
                        onClick={() => setColorMode('light')}
                        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                          colorMode === 'light'
                            ? 'bg-white/10 text-white'
                            : 'text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        Light
                      </button>
                      <button
                        onClick={() => setColorMode('dark')}
                        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                          colorMode === 'dark'
                            ? 'bg-white/10 text-white'
                            : 'text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        Dark
                      </button>
                    </div>
                  </div>

                  {/* Preview */}
                  <LivePreview colors={colors} typography={typography} colorMode={colorMode} />
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="border-white/10 hover:bg-white/10"
                >
                  Reset to Defaults
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={onClose}
                    className="border-white/10 hover:bg-white/10"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleApply}
                    className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-300
                               border border-purple-500/50"
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
