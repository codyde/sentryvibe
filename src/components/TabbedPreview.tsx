'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import PreviewPanel from './PreviewPanel';
import EditorTab from './EditorTab';

interface TabbedPreviewProps {
  selectedProject?: string | null;
  projectId?: string | null;
  onStartServer?: () => void;
  onStopServer?: () => void;
}

export default function TabbedPreview({
  selectedProject,
  projectId,
  onStartServer,
  onStopServer,
}: TabbedPreviewProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'editor'>('preview');

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="h-full flex flex-col bg-black/20 backdrop-blur-md border border-white/10 rounded-xl shadow-xl overflow-hidden"
    >
      {/* Tabs Header */}
      <div className="border-b border-white/10 flex">
        <button
          onClick={() => setActiveTab('preview')}
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'preview'
              ? 'border-purple-500 text-white bg-white/5'
              : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          Preview
        </button>
        <button
          onClick={() => setActiveTab('editor')}
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'editor'
              ? 'border-purple-500 text-white bg-white/5'
              : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          Editor
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'preview' ? (
          <PreviewPanel
            selectedProject={selectedProject}
            onStartServer={onStartServer}
            onStopServer={onStopServer}
          />
        ) : (
          <EditorTab projectId={projectId} />
        )}
      </div>
    </motion.div>
  );
}
