'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, RefreshCw } from 'lucide-react';

export default function PreviewPanel() {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [key, setKey] = useState(0);

  useEffect(() => {
    const handleDevServerStarted = (event: Event) => {
      const customEvent = event as CustomEvent;
      setPreviewUrl(customEvent.detail.url);
    };

    window.addEventListener('devServerStarted', handleDevServerStarted);
    return () => window.removeEventListener('devServerStarted', handleDevServerStarted);
  }, []);

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
      className="h-full flex flex-col bg-black border border-white/10 rounded-lg overflow-hidden"
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
        </div>
      </div>
      <div className="flex-1 bg-white">
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