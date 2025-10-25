'use client';

import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

interface ActiveTodoIndicatorProps {
  todo: {
    content: string;
    activeForm: string;
  };
  currentTool?: {
    name: string;
    state: 'input-streaming' | 'input-available' | 'output-available';
  } | null;
}

export function ActiveTodoIndicator({ todo, currentTool }: ActiveTodoIndicatorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="mb-4 p-3 rounded-lg border border-purple-500/30 bg-purple-950/20"
    >
      <div className="flex items-start gap-3">
        <Loader2 className="w-4 h-4 text-purple-400 mt-0.5 animate-spin flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 mb-1">Currently Working On</p>
          <p className="text-sm font-medium text-white">{todo.activeForm}</p>

          {currentTool && (
            <div className="mt-2 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              <p className="text-xs text-gray-400">
                Executing: <span className="text-yellow-400 font-mono">{currentTool.name}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
