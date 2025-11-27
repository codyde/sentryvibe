'use client';

import { useState, useEffect, forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Monitor, Code, Terminal } from 'lucide-react';
import PreviewPanel from './PreviewPanel';
import EditorTab from './EditorTab';
import TerminalOutput from './TerminalOutput';

interface TabbedPreviewProps {
  selectedProject?: string | null;
  projectId?: string | null;
  onStartServer?: () => void;
  onStopServer?: () => void;
  onStartTunnel?: () => void;
  onStopTunnel?: () => void;
  isStartingServer?: boolean;
  isStoppingServer?: boolean;
  isStartingTunnel?: boolean;
  isStoppingTunnel?: boolean;
  isBuildActive?: boolean;
  onPortDetected?: (port: number) => void;
}

const TabbedPreview = forwardRef<HTMLDivElement, TabbedPreviewProps>(({
  selectedProject,
  projectId,
  onStartServer,
  onStopServer,
  onStartTunnel,
  onStopTunnel,
  isStartingServer,
  isStoppingServer,
  isStartingTunnel,
  isStoppingTunnel,
  isBuildActive,
  onPortDetected,
}, ref) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'editor' | 'terminal'>('preview');

  // Listen for global events to switch tabs
  useEffect(() => {
    const handleSwitchToEditor = () => {
      console.log('📁 Switching to Editor tab');
      setActiveTab('editor');
    };
    const handleSwitchToPreview = () => {
      console.log('👁️  Switching to Preview tab');
      setActiveTab('preview');
    };
    const handleSwitchToTerminal = () => {
      console.log('💻 Switching to Terminal tab');
      setActiveTab('terminal');
    };

    window.addEventListener('switch-to-editor', handleSwitchToEditor);
    window.addEventListener('switch-to-preview', handleSwitchToPreview);
    window.addEventListener('switch-to-terminal', handleSwitchToTerminal);

    return () => {
      window.removeEventListener('switch-to-editor', handleSwitchToEditor);
      window.removeEventListener('switch-to-preview', handleSwitchToPreview);
      window.removeEventListener('switch-to-terminal', handleSwitchToTerminal);
    };
  }, []);

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
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'preview'
              ? 'border-purple-500 text-white bg-white/5'
              : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Monitor className="w-4 h-4" />
          Preview
        </button>
        <button
          onClick={() => setActiveTab('editor')}
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'editor'
              ? 'border-purple-500 text-white bg-white/5'
              : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Code className="w-4 h-4" />
          Editor
        </button>
        <button
          onClick={() => setActiveTab('terminal')}
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'terminal'
              ? 'border-purple-500 text-white bg-white/5'
              : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Terminal className="w-4 h-4" />
          Terminal
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'preview' && (
          <PreviewPanel
            selectedProject={selectedProject}
            onStartServer={onStartServer}
            onStopServer={onStopServer}
            onStartTunnel={onStartTunnel}
            onStopTunnel={onStopTunnel}
            isStartingServer={isStartingServer}
            isStoppingServer={isStoppingServer}
            isStartingTunnel={isStartingTunnel}
            isStoppingTunnel={isStoppingTunnel}
            isBuildActive={isBuildActive}
          />
        )}
        {activeTab === 'editor' && (
          <EditorTab projectId={projectId} />
        )}
        {activeTab === 'terminal' && (
          <div className="h-full">
            <TerminalOutput
              projectId={projectId}
              onPortDetected={onPortDetected}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
});

TabbedPreview.displayName = 'TabbedPreview';

export default TabbedPreview;
