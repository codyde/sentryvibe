'use client';

import { useState, useEffect } from 'react';
import { X, Terminal, Square, Server, Globe, ExternalLink, Copy, Check, RefreshCw, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRunner } from '@/contexts/RunnerContext';
import { useProcesses, type RunningProcess } from '@/queries/processes';
import { useStopProcess, useStopTunnel } from '@/mutations/processes';

interface ProcessManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProcessManagerModal({ isOpen, onClose }: ProcessManagerModalProps) {
  const { selectedRunnerId } = useRunner();
  const { data, isLoading, refetch, dataUpdatedAt } = useProcesses(isOpen);
  const stopProcessMutation = useStopProcess();
  const stopTunnelMutation = useStopTunnel();
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const processes = data?.processes || [];

  // Format last updated time
  const getLastUpdated = () => {
    if (!dataUpdatedAt) return 'Never';
    const seconds = Math.floor((Date.now() - dataUpdatedAt) / 1000);
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  };

  const [lastUpdatedText, setLastUpdatedText] = useState(getLastUpdated());

  // Update the "last updated" text every second
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setLastUpdatedText(getLastUpdated());
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, dataUpdatedAt]);

  const handleStopProcess = (projectId: string) => {
    stopProcessMutation.mutate({ projectId, runnerId: selectedRunnerId });
  };

  const handleStopTunnel = (projectId: string) => {
    stopTunnelMutation.mutate({ projectId, runnerId: selectedRunnerId });
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const handleOpenUrl = (url: string) => {
    window.open(url, '_blank');
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
            className="relative w-full max-w-xl bg-gradient-to-br from-gray-900 to-gray-800 border border-white/10 rounded-xl shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <Activity className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Running Services</h2>
                  <p className="text-xs text-gray-500">
                    {processes.length} active · Updated {lastUpdatedText}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 max-h-[500px] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
                </div>
              ) : processes.length === 0 ? (
                <div className="text-center py-12">
                  <Terminal className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                  <p className="text-gray-400 font-medium">No services running</p>
                  <p className="text-sm text-gray-500 mt-1">Start a dev server from a project to see it here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {processes.map((proc) => (
                    <div
                      key={proc.projectId}
                      className="p-4 bg-white/5 border border-white/10 rounded-lg"
                    >
                      {/* Project Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            proc.status === 'running' ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'
                          }`} />
                          <h3 className="font-medium text-white">{proc.projectName}</h3>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-medium ${
                            proc.status === 'running'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {proc.status}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-500 font-mono">
                          {proc.runnerId}
                        </span>
                      </div>

                      {/* Service Details */}
                      <div className="space-y-2">
                        {/* Dev Server */}
                        <div className="flex items-center justify-between p-2.5 bg-black/30 rounded-lg">
                          <div className="flex items-center gap-3">
                            <Server className="w-4 h-4 text-green-400" />
                            <div>
                              <p className="text-sm text-white">Dev Server</p>
                              {proc.port && (
                                <p className="text-xs font-mono text-gray-400">localhost:{proc.port}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {proc.port && (
                              <button
                                onClick={() => handleOpenUrl(`http://localhost:${proc.port}`)}
                                className="p-1.5 hover:bg-white/10 rounded transition-colors"
                                title="Open in browser"
                              >
                                <ExternalLink className="w-4 h-4 text-gray-400 hover:text-white" />
                              </button>
                            )}
                            <button
                              onClick={() => handleStopProcess(proc.projectId)}
                              disabled={stopProcessMutation.isPending}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <Square className="w-3 h-3" />
                              Stop
                            </button>
                          </div>
                        </div>

                        {/* Tunnel */}
                        {proc.tunnelUrl ? (
                          <div className="flex items-center justify-between p-2.5 bg-black/30 rounded-lg">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <Globe className="w-4 h-4 text-blue-400 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-white">Public Tunnel</p>
                                <p className="text-xs font-mono text-blue-400 truncate" title={proc.tunnelUrl}>
                                  {proc.tunnelUrl}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              <button
                                onClick={() => handleCopyUrl(proc.tunnelUrl!)}
                                className="p-1.5 hover:bg-white/10 rounded transition-colors"
                                title="Copy URL"
                              >
                                {copiedUrl === proc.tunnelUrl ? (
                                  <Check className="w-4 h-4 text-green-400" />
                                ) : (
                                  <Copy className="w-4 h-4 text-gray-400 hover:text-white" />
                                )}
                              </button>
                              <button
                                onClick={() => handleOpenUrl(proc.tunnelUrl!)}
                                className="p-1.5 hover:bg-white/10 rounded transition-colors"
                                title="Open in browser"
                              >
                                <ExternalLink className="w-4 h-4 text-gray-400 hover:text-white" />
                              </button>
                              <button
                                onClick={() => handleStopTunnel(proc.projectId)}
                                disabled={stopTunnelMutation.isPending}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 rounded-lg transition-colors disabled:opacity-50"
                              >
                                <Square className="w-3 h-3" />
                                Stop
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 p-2.5 bg-black/20 rounded-lg opacity-50">
                            <Globe className="w-4 h-4 text-gray-600" />
                            <p className="text-xs text-gray-500">No tunnel active</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 border-t border-white/10 bg-black/20">
              <button
                onClick={() => refetch()}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-sm text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
