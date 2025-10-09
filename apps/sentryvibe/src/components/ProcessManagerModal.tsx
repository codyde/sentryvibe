'use client';

import { useState, useEffect } from 'react';
import { X, Terminal, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface RunningProcess {
  projectId: string;
  projectName: string;
  projectSlug: string;
  pid: number | null;
  port: number | null;
  startTime: Date;
  status: string;
  inMemory: boolean;
}

interface ProcessManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProcessManagerModal({ isOpen, onClose }: ProcessManagerModalProps) {
  const [processes, setProcesses] = useState<RunningProcess[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchProcesses();
    }
  }, [isOpen]);

  const fetchProcesses = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/processes');
      const data = await res.json();
      setProcesses(data.processes || []);
    } catch (error) {
      console.error('Failed to fetch processes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const stopProcess = async (projectId: string) => {
    try {
      await fetch(`/api/projects/${projectId}/stop`, { method: 'POST' });
      // Refetch immediately after stopping
      fetchProcesses();
    } catch (error) {
      console.error('Failed to stop process:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-2xl bg-gradient-to-br from-gray-900 to-gray-800 border border-white/10 rounded-xl shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Terminal className="w-6 h-6 text-purple-400" />
                <h2 className="text-xl font-semibold text-white">Running Dev Servers</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                </div>
              ) : processes.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Terminal className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No dev servers running</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {processes.map((proc) => (
                    <div
                      key={proc.projectId}
                      className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-white">{proc.projectName}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${
                            proc.status === 'running' ? 'bg-[#92DD00]/20 text-[#92DD00] border-[#92DD00]/30' :
                            'bg-[#FFD00E]/20 text-[#FFD00E] border-[#FFD00E]/30'
                          }`}>
                            {proc.status}
                          </span>
                          {!proc.inMemory && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300" title="Process not in memory - may be orphaned">
                              Orphaned?
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-400">
                          {proc.pid && <span>PID: {proc.pid}</span>}
                          {proc.port && <span>Port: {proc.port}</span>}
                          <span>Started: {new Date(proc.startTime).toLocaleTimeString()}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => stopProcess(proc.projectId)}
                        className="flex items-center gap-2 px-3 py-2 text-sm bg-[#FF45A8]/20 hover:bg-[#FF45A8]/30 text-[#FF45A8] border border-[#FF45A8]/30 rounded transition-colors"
                      >
                        <Square className="w-4 h-4" />
                        Stop
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 p-6 border-t border-white/10">
              <button
                onClick={fetchProcesses}
                disabled={isLoading}
                className="px-4 py-2 text-sm text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
