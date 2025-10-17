'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Settings2, X, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';

interface ElementCommentProps {
  element: {
    selector: string;
    tagName: string;
    className: string;
    textContent: string;
    boundingRect: {
      top: number;
      left: number;
      width: number;
      height: number;
    };
  };
  position: { x: number; y: number };
  onSubmit: (prompt: string) => void;
  onClose: () => void;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}

export default function ElementComment({
  element,
  position,
  onSubmit,
  onClose,
  status = 'pending',
}: ElementCommentProps) {
  const [prompt, setPrompt] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  const handleSubmit = () => {
    if (prompt.trim()) {
      onSubmit(prompt);
      setPrompt('');
      // Window will auto-minimize when status changes to 'processing'
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  // Position calculations:
  // Circle is centered at click position (position.x, position.y)
  const circleSize = 32;
  const circleLeft = position.x - (circleSize / 2); // Center circle on click
  const circleTop = position.y - (circleSize / 2);

  // Comment window appears to the top-right of the circle
  const commentWidth = showDetails ? 400 : 280;
  const commentLeft = circleLeft + circleSize + 2; // 2px to the right of circle
  const commentTop = circleTop; // Aligned with top of circle

  return (
    <>
      {/* Only show comment window for pending status - no status orbs */}
      {status === 'pending' && (
        <>
          {/* Anchor circle at click position */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed z-[100]"
            style={{
              left: `${circleLeft}px`,
              top: `${circleTop}px`,
            }}
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center shadow-lg border-2 bg-purple-500/20 border-purple-400">
              <div className="w-2 h-2 rounded-full bg-purple-400"></div>
            </div>
          </motion.div>

          {/* Comment window - to top-right of circle */}
        <motion.div
          initial={{ scale: 0, opacity: 0, x: -10 }}
          animate={{ scale: 1, opacity: 1, x: 0 }}
          exit={{ scale: 0, opacity: 0, x: -10 }}
          className="fixed z-[101] bg-gradient-to-br from-gray-900 to-gray-800 border border-purple-500/30 rounded-lg shadow-2xl"
          style={{
            left: `${commentLeft}px`,
            top: `${commentTop}px`,
            width: `${commentWidth}px`,
          }}
        >
          {/* Header */}
          <div className="border-b border-purple-500/20 px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div>
              <span className="text-xs font-medium text-gray-400">
                {element.tagName}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="p-1 hover:bg-white/10 rounded transition-colors"
                title={showDetails ? 'Hide details' : 'Show details'}
              >
                <Settings2 className={`w-3.5 h-3.5 transition-colors ${showDetails ? 'text-purple-400' : 'text-gray-500'}`} />
              </button>
              <button
                onClick={onClose}
                className="p-1 hover:bg-white/10 rounded transition-colors"
                title="Close"
              >
                <X className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>
          </div>

          {/* Details (expandable) */}
          <AnimatePresence>
            {showDetails && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-b border-purple-500/10 overflow-hidden"
              >
                <div className="p-3 space-y-2 text-xs">
                  <div>
                    <span className="text-gray-500">Selector:</span>
                    <code className="ml-2 text-purple-300 font-mono">{element.selector}</code>
                  </div>
                  {element.className && (
                    <div>
                      <span className="text-gray-500">Classes:</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {element.className.split(' ').slice(0, 5).map((cls, i) => (
                          <span key={i} className="bg-purple-500/20 px-1.5 py-0.5 rounded text-purple-300 font-mono">
                            {cls}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {element.textContent && (
                    <div>
                      <span className="text-gray-500">Text:</span>
                      <span className="ml-2 text-gray-300">{element.textContent.substring(0, 50)}...</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input */}
          <div className="p-3 space-y-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your change..."
              rows={2}
              className="w-full px-3 py-2 bg-black/40 border border-purple-500/30 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 resize-none"
              autoFocus
            />
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500">⌘↵</div>
              <Button
                onClick={handleSubmit}
                disabled={!prompt.trim()}
                size="sm"
                className="h-6 px-2 text-xs bg-purple-500/20 border-purple-500/30 hover:bg-purple-500/30 text-purple-300"
              >
                <Send className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </motion.div>
        </>
      )}
    </>
  );
}
