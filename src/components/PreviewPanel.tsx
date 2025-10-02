'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, RefreshCw, Play, Square } from 'lucide-react';
import { useProjects } from '@/contexts/ProjectContext';

interface PreviewPanelProps {
  selectedProject?: string | null;
  onStartServer?: () => void;
  onStopServer?: () => void;
}

export default function PreviewPanel({ selectedProject, onStartServer, onStopServer }: PreviewPanelProps) {
  const { projects } = useProjects();
  const [key, setKey] = useState(0);

  // Find the current project
  const project = projects.find(p => p.slug === selectedProject);

  // Construct preview URL from project data
  const previewUrl = project?.devServerPort
    ? `http://localhost:${project.devServerPort}`
    : '';

  const handleRefresh = () => {
    setKey(prev => prev + 1);
  };

  const handleOpenInNewTab = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="h-full flex flex-col bg-black/20 backdrop-blur-md border border-white/10 rounded-xl shadow-xl overflow-hidden"
    >
      <div className="border-b border-white/10 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          {previewUrl ? (
            <>
              {/* Control buttons on the left */}
              <button
                onClick={handleRefresh}
                className="p-2 rounded-md hover:bg-white/5 transition-all duration-200"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={handleOpenInNewTab}
                className="p-2 rounded-md hover:bg-white/5 transition-all duration-200"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </button>

              {/* URL Display */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900/50 border border-white/10 rounded-md">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-sm font-mono text-gray-300">{previewUrl}</span>
              </div>
            </>
          ) : (
            <h2 className="text-lg font-light">Preview</h2>
          )}
        </div>

        {/* Dev Server Controls - Right side */}
        <div className="flex items-center gap-2">
          {project?.runCommand && (
            <>
              {project.devServerStatus === 'running' ? (
                <button
                  onClick={onStopServer}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-md transition-colors"
                >
                  <Square className="w-4 h-4" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={onStartServer}
                  disabled={project.devServerStatus === 'starting'}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-md transition-colors disabled:opacity-50"
                >
                  <Play className="w-4 h-4" />
                  {project.devServerStatus === 'starting' ? 'Starting...' : 'Start'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex-1 bg-gray-800">
        {previewUrl ? (
          <iframe
            key={key}
            src={previewUrl}
            className="w-full h-full border-0"
            title="Preview"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            {project?.devServerStatus === 'running' ? (
              <p>Waiting for dev server...</p>
            ) : (
              <p>Start the dev server to see preview</p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}