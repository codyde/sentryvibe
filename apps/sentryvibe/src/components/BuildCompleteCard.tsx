'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, Play } from 'lucide-react';

interface BuildCompleteCardProps {
  projectName: string;
  onStartServer: () => void;
}

export function BuildCompleteCard({ projectName, onStartServer }: BuildCompleteCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="p-4 rounded-lg border border-green-500/30 bg-gradient-to-r from-green-950/40 to-green-900/20"
    >
      <div className="flex items-start gap-4">
        {/* Success Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
          className="flex-shrink-0"
        >
          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-green-400" />
          </div>
        </motion.div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-white mb-1">Build Complete!</h3>
          <p className="text-sm text-gray-300 mb-3">
            Your project <span className="font-mono text-green-400">{projectName}</span> is ready to run.
          </p>

          {/* Start Server Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onStartServer}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors shadow-lg shadow-green-500/20"
          >
            <Play className="w-4 h-4" />
            <span>Start Dev Server</span>
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
