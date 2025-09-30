'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, RefreshCw, Play, Square } from 'lucide-react';

interface PreviewPanelProps {
  selectedProject?: string | null;
}

export default function PreviewPanel({ selectedProject }: PreviewPanelProps) {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [key, setKey] = useState(0);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [runningProject, setRunningProject] = useState<string | null>(null);

  useEffect(() => {
    const handleDevServerStarted = (event: Event) => {
      const customEvent = event as CustomEvent;
      setPreviewUrl(customEvent.detail.url);
    };

    const handleDevServerStopped = () => {
      setPreviewUrl('');
    };

    window.addEventListener('devServerStarted', handleDevServerStarted);
    window.addEventListener('devServerStopped', handleDevServerStopped);
    return () => {
      window.removeEventListener('devServerStarted', handleDevServerStarted);
      window.removeEventListener('devServerStopped', handleDevServerStopped);
    };
  }, []);

  const handleRefresh = () => {
    setKey(prev => prev + 1);
  };

  const handleOpenInNewTab = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  };

  const handleStartDev = async () => {
    if (!selectedProject) return;

    setIsStarting(true);
    try {
      const directory = `projects/${selectedProject}`;
      const response = await fetch('/api/start-dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory }),
      });
      const data = await response.json();
      if (data.success) {
        setRunningProject(selectedProject);
        // Notify about the dev server URL
        window.dispatchEvent(new CustomEvent('devServerStarted', {
          detail: { url: data.url }
        }));
      }
    } catch (error) {
      console.error('Failed to start dev server:', error);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopDev = async () => {
    if (!runningProject) return;

    setIsStopping(true);
    try {
      const directory = `projects/${runningProject}`;
      const response = await fetch('/api/start-dev', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory }),
      });
      const data = await response.json();
      if (data.success) {
        setRunningProject(null);
        setPreviewUrl('');
        setKey(prev => prev + 1); // Force iframe refresh
        // Notify that dev server stopped
        window.dispatchEvent(new CustomEvent('devServerStopped'));
      }
    } catch (error) {
      console.error('Failed to stop dev server:', error);
      // Even if there's an error, try to reset the state
      setRunningProject(null);
      setPreviewUrl('');
      setKey(prev => prev + 1);
      window.dispatchEvent(new CustomEvent('devServerStopped'));
    } finally {
      setIsStopping(false);
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
        <div className="flex items-center gap-2 flex-1">
          <h2 className="text-lg font-light">Preview</h2>
          {previewUrl && (
            <span className="text-xs text-gray-500 font-mono">{previewUrl}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={!previewUrl}
            className="p-2 rounded-md hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleOpenInNewTab}
            disabled={!previewUrl}
            className="p-2 rounded-md hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            title="Open in new tab"
          >
            <ExternalLink className="w-4 h-4" />
          </button>

          {/* Start/Stop Buttons */}
          {runningProject && (
            <button
              onClick={handleStopDev}
              disabled={isStopping}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed transition-all duration-200"
            >
              <Square className="w-4 h-4" />
              {isStopping ? 'Stopping...' : 'Stop'}
            </button>
          )}
          <button
            onClick={handleStartDev}
            disabled={!selectedProject || isStarting || !!runningProject}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-md hover:bg-gray-200 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed transition-all duration-200"
          >
            <Play className="w-4 h-4" />
            {isStarting ? 'Starting...' : 'Start'}
          </button>
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
            <p>Select a directory and click Start to see preview</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}