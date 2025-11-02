'use client';

import { X, Terminal, Square, Server, Cloud, Monitor, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRunner } from '@/contexts/RunnerContext';
import { useProcesses, type RunningProcess } from '@/queries/processes';
import { useStopProcess, useStopTunnel } from '@/mutations/processes';

interface ProcessManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProcessManagerModal({ isOpen, onClose }: ProcessManagerModalProps) {
  const { availableRunners, selectedRunnerId, setSelectedRunnerId } = useRunner();

  // TanStack Query hooks
  const { data, isLoading, refetch } = useProcesses(isOpen);
  const stopProcessMutation = useStopProcess();
  const stopTunnelMutation = useStopTunnel();

  const processes = data?.processes || [];

  const handleStopProcess = (projectId: string) => {
    stopProcessMutation.mutate({ projectId, runnerId: selectedRunnerId });
  };

  const handleStopTunnel = (projectId: string) => {
    stopTunnelMutation.mutate({ projectId, runnerId: selectedRunnerId });
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
                <Monitor className="w-6 h-6 text-purple-400" />
                <h2 className="text-xl font-semibold text-white">System Monitor</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6 max-h-[600px] overflow-y-auto">
              {/* Runners Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Server className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                    Runners ({availableRunners.length} online)
                  </h3>
                </div>
                {availableRunners.length === 0 ? (
                  <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                    <p className="text-sm text-orange-300">No runners connected</p>
                    <p className="text-xs text-orange-400/70 mt-1">Start a runner to manage services</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {availableRunners.map((runner) => {
                      const isSelected = runner.runnerId === selectedRunnerId;
                      const timeSinceHeartbeat = Date.now() - runner.lastHeartbeat;
                      const isHealthy = timeSinceHeartbeat < 30000;

                      return (
                        <button
                          key={runner.runnerId}
                          onClick={() => setSelectedRunnerId(runner.runnerId)}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            isSelected
                              ? 'bg-purple-500/20 border-purple-500/40 text-white'
                              : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${
                              isHealthy ? 'bg-green-400 shadow-sm shadow-green-400/50' : 'bg-red-400'
                            }`} />
                            <span className="text-xs font-medium truncate">{runner.runnerId}</span>
                          </div>
                          {isSelected && (
                            <span className="text-[10px] text-purple-400 mt-1 block">Active</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Services Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Terminal className="w-4 h-4 text-green-400" />
                  <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                    Active Services ({processes.length})
                  </h3>
                </div>
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
                    <p>No services running</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {processes.map((proc) => (
                      <div
                        key={proc.projectId}
                        className="p-4 bg-white/5 border border-white/10 rounded-lg space-y-3"
                      >
                        {/* Project Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-white">{proc.projectName}</h3>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${
                              proc.status === 'running' ? 'bg-[#92DD00]/20 text-[#92DD00] border-[#92DD00]/30' :
                              'bg-[#FFD00E]/20 text-[#FFD00E] border-[#FFD00E]/30'
                            }`}>
                              {proc.status}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Server className="w-3 h-3" />
                            {proc.runnerId}
                          </span>
                        </div>

                        {/* Service Details */}
                        <div className="space-y-2">
                          {/* Dev Server */}
                          <div className="flex items-center justify-between p-2 bg-black/20 rounded">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-green-400 shadow-sm shadow-green-400/50"></div>
                              <span className="text-sm text-gray-300">Dev Server</span>
                            </div>
                            <div className="flex items-center gap-3">
                              {proc.port && (
                                <span className="text-xs font-mono text-gray-400">
                                  localhost:{proc.port}
                                </span>
                              )}
                              <button
                                onClick={() => handleStopProcess(proc.projectId)}
                                className="flex items-center gap-1.5 px-2 py-1 text-xs bg-[#FF45A8]/20 hover:bg-[#FF45A8]/30 text-[#FF45A8] border border-[#FF45A8]/30 rounded transition-colors"
                              >
                                <Square className="w-3 h-3" />
                                Stop
                              </button>
                            </div>
                          </div>

                          {/* Tunnel */}
                          {proc.tunnelUrl ? (
                            <div className="flex items-center justify-between p-2 bg-black/20 rounded">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-blue-400 shadow-sm shadow-blue-400/50"></div>
                                <span className="text-sm text-gray-300">Tunnel</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <a
                                  href={proc.tunnelUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-mono text-blue-400 hover:text-blue-300 underline truncate max-w-[200px]"
                                  title={proc.tunnelUrl}
                                >
                                  {proc.tunnelUrl.replace('https://', '')}
                                </a>
                                <button
                                  onClick={() => handleStopTunnel(proc.projectId)}
                                  className="flex items-center gap-1.5 px-2 py-1 text-xs bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/40 rounded transition-colors"
                                >
                                  <Square className="w-3 h-3" />
                                  Stop
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 p-2 bg-black/20 rounded opacity-50">
                              <Globe className="w-3 h-3 text-gray-600" />
                              <span className="text-xs text-gray-500">No tunnel active</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 p-6 border-t border-white/10">
              <button
                onClick={() => refetch()}
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
