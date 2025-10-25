'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Play, Loader2, Square } from 'lucide-react';

interface BuildCompleteCardProps {
  projectName: string;
  onStartServer: () => void;
  onStopServer: () => void;
  progress: number; // 0-100
  serverStatus: 'stopped' | 'starting' | 'running' | 'failed' | null;
  isStartingServer: boolean;
  isStoppingServer: boolean;
}

export function BuildCompleteCard({
  projectName,
  onStartServer,
  onStopServer,
  progress,
  serverStatus,
  isStartingServer,
  isStoppingServer
}: BuildCompleteCardProps) {
  const [phase, setPhase] = useState<'finishing' | 'complete'>('finishing');

  // Transition from finishing to complete after a short delay
  useEffect(() => {
    if (progress >= 100) {
      const timer = setTimeout(() => {
        setPhase('complete');
      }, 1500); // Show "Finishing up" for 1.5s

      return () => clearTimeout(timer);
    }
  }, [progress]);

  return (
    <AnimatePresence mode="wait">
      {phase === 'finishing' ? (
        <motion.div
          key="finishing"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.3 }}
          className="mb-4 p-3 rounded-lg border border-yellow-500/30 bg-yellow-950/20"
        >
          <div className="flex items-center gap-3">
            <Loader2 className="w-4 h-4 text-yellow-400 animate-spin flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Finishing up...</p>
              <p className="text-xs text-gray-400">Finalizing build and cleaning up</p>
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="complete"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-4 p-3 rounded-lg border border-green-500/30 bg-green-950/20"
        >
          <div className="flex items-center gap-3">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            >
              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
            </motion.div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">Build Complete!</p>
              <p className="text-xs text-gray-400">
                <span className="font-mono text-green-400">{projectName}</span> is ready to run
              </p>
            </div>
            {/* Server Control Button - Synced with Preview Pane */}
            {serverStatus === 'running' ? (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onStopServer}
                disabled={isStoppingServer}
                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shadow-lg shadow-red-500/20"
              >
                {isStoppingServer ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
                <span>{isStoppingServer ? 'Stopping...' : 'Stop'}</span>
              </motion.button>
            ) : serverStatus === 'starting' || isStartingServer ? (
              <motion.button
                disabled
                className="px-3 py-1.5 bg-green-500/50 text-white text-xs font-medium rounded-lg flex items-center gap-1.5"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Starting...</span>
              </motion.button>
            ) : (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onStartServer}
                disabled={isStartingServer}
                className="px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:bg-green-500/50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shadow-lg shadow-green-500/20"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Start</span>
              </motion.button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
