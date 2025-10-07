'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

interface InitializingCardProps {
  projectName: string;
  message?: string;
}

export default function InitializingCard({ projectName, message }: InitializingCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full p-8 rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-950/40 via-gray-900/95 to-gray-900/95 shadow-2xl"
    >
      <div className="flex flex-col items-center text-center space-y-4">
        {/* Animated Icon */}
        <motion.div
          animate={{
            rotate: 360,
            scale: [1, 1.1, 1],
          }}
          transition={{
            rotate: { duration: 3, repeat: Infinity, ease: "linear" },
            scale: { duration: 2, repeat: Infinity, ease: "easeInOut" }
          }}
          className="relative"
        >
          <div className="absolute inset-0 bg-purple-500/20 rounded-full blur-xl" />
          <Sparkles className="w-12 h-12 text-purple-400 relative z-10" />
        </motion.div>

        {/* Text */}
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-white">
            Initializing Build
          </h3>
          <p className="text-sm text-gray-400">
            {message || `Setting up ${projectName}...`}
          </p>
        </div>

        {/* Animated Dots */}
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
            className="w-2 h-2 bg-purple-400 rounded-full"
          />
          <motion.div
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
            className="w-2 h-2 bg-pink-400 rounded-full"
          />
          <motion.div
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
            className="w-2 h-2 bg-purple-400 rounded-full"
          />
        </div>
      </div>
    </motion.div>
  );
}
