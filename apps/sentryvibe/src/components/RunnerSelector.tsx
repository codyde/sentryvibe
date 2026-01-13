'use client';

import { useRunner } from '@/contexts/RunnerContext';
import { Server, CheckCircle2, Circle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function RunnerSelector() {
  const { selectedRunnerId, setSelectedRunnerId, availableRunners, isLoading } = useRunner();

  if (isLoading) {
    return (
      <div className="p-3 bg-black/20 rounded-lg border border-white/10">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-gray-500 animate-pulse" />
          <span className="text-xs text-gray-500">Loading runners...</span>
        </div>
      </div>
    );
  }

  if (availableRunners.length === 0) {
    return (
      <div className="p-3 bg-orange-500/10 rounded-lg border border-orange-500/30">
        <div className="flex items-center gap-2">
          <Circle className="w-4 h-4 text-orange-400" />
          <div className="flex-1">
            <p className="text-xs font-medium text-orange-300">No Runners Connected</p>
            <p className="text-[10px] text-orange-400/70">Start a runner to begin building</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2">
        <Server className="w-3 h-3 text-gray-500" />
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
          Active Runner
        </span>
      </div>

      <div className="space-y-1">
        <AnimatePresence mode="popLayout">
          {availableRunners.filter(runner => runner !== null).map((runner) => {
            const isSelected = runner.runnerId === selectedRunnerId;
            const timeSinceHeartbeat = Date.now() - runner.lastHeartbeat;
            const isHealthy = timeSinceHeartbeat < 30000; // 30 seconds

            return (
              <motion.button
                key={runner.runnerId}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onClick={() => setSelectedRunnerId(runner.runnerId)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all ${
                  isSelected
                    ? 'bg-theme-primary-muted border border-theme-primary/40 text-white'
                    : 'bg-black/20 border border-white/10 text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {isSelected ? (
                  <CheckCircle2 className="w-4 h-4 text-theme-primary flex-shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-gray-600 flex-shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">
                    {runner.runnerId}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      isHealthy ? 'bg-green-400 shadow-sm shadow-green-400/50' : 'bg-red-400'
                    }`} />
                    <span className="text-[10px] text-gray-500">
                      {isHealthy ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
