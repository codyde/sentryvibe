'use client';

import { useEffect, forwardRef } from 'react';
import { motion } from 'framer-motion';
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
  devicePreset?: 'desktop' | 'tablet' | 'mobile';
  activeTab?: 'preview' | 'editor' | 'terminal';
  onTabChange?: (tab: 'preview' | 'editor' | 'terminal') => void;
  isSelectionModeEnabled?: boolean;
  onSelectionModeChange?: (enabled: boolean) => void;
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
  activeTab = 'preview',
  onTabChange,
  isSelectionModeEnabled = false,
  onSelectionModeChange,
}, ref) => {

  // Listen for global events to switch tabs
  useEffect(() => {
    const handleSwitchToEditor = () => onTabChange?.('editor');
    const handleSwitchToPreview = () => onTabChange?.('preview');
    const handleSwitchToTerminal = () => onTabChange?.('terminal');

    window.addEventListener('switch-to-editor', handleSwitchToEditor);
    window.addEventListener('switch-to-preview', handleSwitchToPreview);
    window.addEventListener('switch-to-terminal', handleSwitchToTerminal);

    return () => {
      window.removeEventListener('switch-to-editor', handleSwitchToEditor);
      window.removeEventListener('switch-to-preview', handleSwitchToPreview);
      window.removeEventListener('switch-to-terminal', handleSwitchToTerminal);
    };
  }, [onTabChange]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="h-full flex flex-col bg-black/20 backdrop-blur-md border border-white/10 rounded-xl shadow-xl overflow-hidden"
    >
      {/* Tab Content - No header, controls are in app header */}
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
            hideControls={true}
            isSelectionModeEnabled={isSelectionModeEnabled}
            onSelectionModeChange={onSelectionModeChange}
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
