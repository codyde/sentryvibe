'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, RefreshCw, Play, Square } from 'lucide-react';
import { useProjects } from '@/contexts/ProjectContext';
import SelectionMode from './SelectionMode';
import ElementComment from './ElementComment';
import { toggleSelectionMode } from '@/lib/selection/injector';
import { useElementEdits } from '@/hooks/useElementEdits';
import AsciiLoadingAnimation from './AsciiLoadingAnimation';

interface PreviewPanelProps {
  selectedProject?: string | null;
  onStartServer?: () => void;
  onStopServer?: () => void;
  terminalPort?: number | null;
  isBuildActive?: boolean;
}

export default function PreviewPanel({ selectedProject, onStartServer, onStopServer, terminalPort, isBuildActive }: PreviewPanelProps) {
  const { projects } = useProjects();
  const [key, setKey] = useState(0);
  const [isServerReady, setIsServerReady] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isSelectionModeEnabled, setIsSelectionModeEnabled] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { edits, addEdit, removeEdit } = useElementEdits();
  const isCheckingRef = useRef(false);
  const lastReadyPortRef = useRef<number | null>(null);

  // Find the current project
  const project = projects.find(p => p.slug === selectedProject);

  // Use terminal-detected port if available, otherwise fall back to DB port
  const actualPort = terminalPort || project?.devServerPort;

  // Construct preview URL - use proxy for same-origin access (enables selection tool)
  const previewUrl = actualPort && isServerReady && project?.id
    ? `/api/projects/${project.id}/proxy?path=/`
    : '';

  const checkServerHealth = useCallback(async (port: number): Promise<boolean> => {
    const url = `http://localhost:${port}`;

    console.log(`🏥 Health checking ${url}...`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      await fetch(url, {
        signal: controller.signal,
        mode: 'no-cors', // Ignore CORS for health check
      });

      clearTimeout(timeoutId);
      console.log(`✅ Server is ready at ${url}`);
      return true;
    } catch (error) {
      console.log(`   Health check failed for ${url}, will retry...`);
      return false;
    }
  }, []);

  // Health check when port changes (terminal or DB)
  useEffect(() => {
    if (!actualPort || project?.devServerStatus !== 'running') {
      lastReadyPortRef.current = null;
      isCheckingRef.current = false;
      setIsServerReady(false);
      setIsChecking(false);
      return;
    }

    if (lastReadyPortRef.current && lastReadyPortRef.current !== actualPort) {
      lastReadyPortRef.current = null;
    }

    if (lastReadyPortRef.current === actualPort) {
      if (!isServerReady) {
        setIsServerReady(true);
        setIsChecking(false);
      }
      return;
    }

    if (isCheckingRef.current) {
      console.log('⏳ Health check already in progress, skipping duplicate');
      return;
    }

    let cancelled = false;
    isCheckingRef.current = true;
    setIsChecking(true);
    setIsServerReady(false);

    const runHealthCheck = async () => {
      for (let attempt = 0; attempt < 10; attempt++) {
        if (cancelled) return;

        const isReady = await checkServerHealth(actualPort);
        if (cancelled) return;

        if (isReady) {
          lastReadyPortRef.current = actualPort;
          setIsServerReady(true);
          setIsChecking(false);
          return;
        }

        if (cancelled) return;
        await new Promise(resolve => setTimeout(resolve, 500));
        if (cancelled) return;
      }

      if (!cancelled) {
        console.error('❌ Server health check failed after multiple attempts');
        setIsChecking(false);
      }
    };

    runHealthCheck().finally(() => {
      if (!cancelled) {
        isCheckingRef.current = false;
      }
    });

    return () => {
      cancelled = true;
      isCheckingRef.current = false;
    };
  }, [actualPort, project?.devServerStatus, checkServerHealth]);

  const handleRefresh = () => {
    setKey(prev => prev + 1);
  };

  const handleOpenInNewTab = () => {
    // Open the actual dev server URL (use terminal port if available)
    if (actualPort) {
      window.open(`http://localhost:${actualPort}`, '_blank');
    }
  };

  // Auto-sync inspector state when iframe loads or script announces ready
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data.type === 'sentryvibe:ready') {
        console.log('📦 Iframe script ready, syncing inspector state:', isSelectionModeEnabled);
        // Iframe loaded and script ready, sync current state
        if (iframeRef.current) {
          toggleSelectionMode(iframeRef.current, isSelectionModeEnabled);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isSelectionModeEnabled]);

  // Toggle selection mode when button clicked
  useEffect(() => {
    if (!iframeRef.current) return;
    toggleSelectionMode(iframeRef.current, isSelectionModeEnabled);
  }, [isSelectionModeEnabled]);

  // Handle element selection - create comment indicator at click position
  const handleElementSelected = (element: any, prompt: string) => {
    if (!element.clickPosition) {
      console.error('❌ No click position!');
      return;
    }

    // Use click position directly (no transformation)
    // ElementComment will handle positioning the circle and comment window
    const position = {
      x: element.clickPosition.x,
      y: element.clickPosition.y + 60, // Offset down 50px
    };

    console.log('📍 Creating comment:', {
      rawClick: element.clickPosition,
      adjusted: position,
    });

    const editId = addEdit(element, prompt, position);
    console.log('✅ Created edit:', editId);
  };

  // Handle comment submission - send to chat as regular generation
  const handleCommentSubmit = (editId: string, prompt: string) => {
    console.log('🚀 Submitting element change:', editId, prompt);

    const edit = edits.find(e => e.id === editId);
    if (!edit) return;

    // Remove the edit (comment window will close)
    removeEdit(editId);

    // Format prompt with element context
    const formattedPrompt = `Change the element with selector "${edit.element.selector}" (${edit.element.tagName}): ${prompt}`;

    // Send to regular chat flow - will create todo automatically
    window.dispatchEvent(new CustomEvent('selection-change-requested', {
      detail: { element: edit.element, prompt: formattedPrompt },
    }));

    console.log('✅ Sent to chat system');
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
                className="p-2 rounded-md hover:bg-[#7553FF]/20 transition-all duration-200"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={handleOpenInNewTab}
                className="p-2 rounded-md hover:bg-[#7553FF]/20 transition-all duration-200"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </button>

              {/* URL Display - Show actual dev server URL from terminal */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#181225]/80 border border-[#7553FF]/30 rounded-md backdrop-blur-sm">
                <div className="w-2 h-2 rounded-full bg-[#92DD00] shadow-lg shadow-[#92DD00]/50"></div>
                <span className="text-sm font-mono text-gray-300">
                  http://localhost:{actualPort}
                </span>
              </div>

              {/* Selection Mode Toggle */}
              <SelectionMode
                isEnabled={isSelectionModeEnabled}
                onToggle={setIsSelectionModeEnabled}
                onElementSelected={handleElementSelected}
              />
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
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[#FF45A8]/20 hover:bg-[#FF45A8]/30 text-[#FF45A8] border border-[#FF45A8]/30 rounded-md transition-colors"
                >
                  <Square className="w-4 h-4" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={onStartServer}
                  disabled={project.devServerStatus === 'starting'}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[#92DD00]/20 hover:bg-[#92DD00]/30 text-[#92DD00] border border-[#92DD00]/30 rounded-md transition-colors disabled:opacity-50"
                >
                  <Play className="w-4 h-4" />
                  {project.devServerStatus === 'starting' ? 'Starting...' : 'Start'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex-1 bg-gray-800 relative">
        {previewUrl ? (
          <>
            <iframe
              ref={iframeRef}
              key={key}
              src={previewUrl}
              sandbox="allow-scripts allow-forms allow-popups allow-modals allow-storage-access-by-user-activation allow-same-origin"
              allow="geolocation; camera; microphone; fullscreen; clipboard-write; clipboard-read; cross-origin-isolated"
              className="w-full h-full border-0"
              style={{
                colorScheme: 'normal',
                isolation: 'isolate',
              }}
              title="Preview"
            />

            {/* Floating comment indicators */}
            <AnimatePresence>
              {edits.map((edit) => (
                <ElementComment
                  key={edit.id}
                  element={edit.element}
                  position={edit.position}
                  status={edit.status}
                  onSubmit={(prompt) => handleCommentSubmit(edit.id, prompt)}
                  onClose={() => removeEdit(edit.id)}
                />
              ))}
            </AnimatePresence>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            {isBuildActive ? (
              <div className="text-center flex items-center justify-center">
                <div className="max-w-[400px]">
                  <AsciiLoadingAnimation />
                </div>
              </div>
            ) : isChecking ? (
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
            ) : project?.status === 'completed' && project?.runCommand ? (
              <div className="text-center space-y-4 max-w-md">
                <div className="text-6xl">🎉</div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-white">Project Ready!</h3>
                  <p className="text-gray-400">Click the <span className="text-[#92DD00] font-semibold">Start</span> button above to launch your dev server</p>
                </div>
                <div className="flex items-center gap-2 justify-center text-sm text-gray-500">
                  <Play className="w-4 h-4" />
                  <span>Port will be automatically allocated</span>
                </div>
              </div>
            ) : (
              <p>Start the dev server to see preview</p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
