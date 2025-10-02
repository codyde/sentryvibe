'use client';

import { useState, useEffect } from 'react';
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
  const [isServerReady, setIsServerReady] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  // Find the current project
  const project = projects.find(p => p.slug === selectedProject);

  // Construct preview URL from project data
  const previewUrl = project?.devServerPort && isServerReady
    ? `http://localhost:${project.devServerPort}`
    : '';

  // Health check when dev server port changes
  useEffect(() => {
    if (project?.devServerPort && project.devServerStatus === 'running') {
      checkServerHealth(project.devServerPort);
    } else {
      setIsServerReady(false);
    }
  }, [project?.devServerPort, project?.devServerStatus]);

  const checkServerHealth = async (port: number) => {
    const url = `http://localhost:${port}`;
    setIsChecking(true);
    setIsServerReady(false);

    console.log(`🏥 Health checking ${url}...`);

    // Retry up to 10 times with 500ms delay
    for (let i = 0; i < 10; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const res = await fetch(url, {
          signal: controller.signal,
          mode: 'no-cors', // Ignore CORS for health check
        });

        clearTimeout(timeoutId);

        // If we get here, server responded (even 404 is ok, means server is up)
        console.log(`✅ Server is ready at ${url}`);
        setIsServerReady(true);
        setIsChecking(false);
        return;
      } catch (error) {
        console.log(`   Attempt ${i + 1}/10 failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.error(`❌ Server health check failed after 10 attempts`);
    setIsChecking(false);
  };

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
            {isChecking ? (
              <div className="text-center space-y-3">
                <div className="flex items-center gap-2 justify-center">
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
                <p>Waiting for server to be ready...</p>
              </div>
            ) : project?.devServerStatus === 'running' ? (
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