'use client';

import { useState, useEffect, forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Monitor, Code, Terminal } from 'lucide-react';
import PreviewPanel from './PreviewPanel';
import EditorTab from './EditorTab';
import TerminalOutput from './TerminalOutput';
import { cn } from '@/lib/utils';

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
  devicePreset?: 'desktop' | 'tablet' | 'mobile';
  hideControls?: boolean;
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
  devicePreset = 'desktop',
  hideControls = true, // Controls are now in the header
}, ref) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'editor' | 'terminal'>('preview');

  // Listen for global events to switch tabs
  useEffect(() => {
    const handleSwitchToEditor = () => {
      console.log('Switching to Editor tab');
      setActiveTab('editor');
    };
    const handleSwitchToPreview = () => {
      console.log('Switching to Preview tab');
      setActiveTab('preview');
    };
    const handleSwitchToTerminal = () => {
      console.log('Switching to Terminal tab');
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
      {/* Compact Tabs Header */}
      <div className="border-b border-white/10 flex px-1">
        <button
          onClick={() => setActiveTab('preview')}
          className={cn(
            'px-3 py-2 text-xs font-medium transition-colors border-b-2 flex items-center gap-1.5',
            activeTab === 'preview'
              ? 'border-purple-500 text-white bg-white/5'
              : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
          )}
          title="Preview"
        >
          <Monitor className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Preview</span>
        </button>
        <button
          onClick={() => setActiveTab('editor')}
          className={cn(
            'px-3 py-2 text-xs font-medium transition-colors border-b-2 flex items-center gap-1.5',
            activeTab === 'editor'
              ? 'border-purple-500 text-white bg-white/5'
              : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
          )}
          title="Editor"
        >
          <Code className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Editor</span>
        </button>
        <button
          onClick={() => setActiveTab('terminal')}
          className={cn(
            'px-3 py-2 text-xs font-medium transition-colors border-b-2 flex items-center gap-1.5',
            activeTab === 'terminal'
              ? 'border-purple-500 text-white bg-white/5'
              : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
          )}
          title="Terminal"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Terminal</span>
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
            devicePreset={devicePreset}
            hideControls={hideControls}
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
