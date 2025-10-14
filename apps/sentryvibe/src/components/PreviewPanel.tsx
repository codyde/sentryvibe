'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, RefreshCw, Play, Square, Copy, Check, Monitor, Smartphone, Tablet, Cloud, Rocket } from 'lucide-react';
import { useProjects } from '@/contexts/ProjectContext';
import SelectionMode from './SelectionMode';
import ElementComment from './ElementComment';
import { toggleSelectionMode } from '@/lib/selection/injector';
import { useElementEdits } from '@/hooks/useElementEdits';

interface PreviewPanelProps {
  selectedProject?: string | null;
  onStartServer?: () => void;
  onStopServer?: () => void;
  onStartTunnel?: () => void;
  onStopTunnel?: () => void;
  terminalPort?: number | null;
  isStartingServer?: boolean;
  isStoppingServer?: boolean;
  isStartingTunnel?: boolean;
  isStoppingTunnel?: boolean;
}

type DevicePreset = 'desktop' | 'tablet' | 'mobile';

export default function PreviewPanel({ selectedProject, onStartServer, onStopServer, onStartTunnel, onStopTunnel, terminalPort, isStartingServer, isStoppingServer, isStartingTunnel, isStoppingTunnel }: PreviewPanelProps) {
  const { projects } = useProjects();
  const [key, setKey] = useState(0);
  const [isServerReady, setIsServerReady] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isSelectionModeEnabled, setIsSelectionModeEnabled] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [devicePreset, setDevicePreset] = useState<DevicePreset>('desktop');
  const [healthCheckFailed, setHealthCheckFailed] = useState(false);
  const [isTunnelLoading, setIsTunnelLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { edits, addEdit, removeEdit } = useElementEdits();
  const isCheckingRef = useRef(false);
  const lastReadyPortRef = useRef<number | null>(null);
  const lastTunnelUrlRef = useRef<string | null>(null);

  // Find the current project
  const project = projects.find(p => p.slug === selectedProject);

  // Use terminal-detected port if available, otherwise fall back to DB port
  const actualPort = terminalPort || project?.devServerPort;

  // Watch for tunnel URL changes and show loading screen
  useEffect(() => {
    const currentTunnelUrl = project?.tunnelUrl;

    // If tunnel URL just appeared (changed from null/undefined to a value)
    if (currentTunnelUrl && currentTunnelUrl !== lastTunnelUrlRef.current) {
      console.log('🔗 New tunnel URL detected, showing loading screen for 5 seconds');
      setIsTunnelLoading(true);
      lastTunnelUrlRef.current = currentTunnelUrl;

      // Show loading screen for 5 seconds to let tunnel fully initialize
      const timer = setTimeout(() => {
        console.log('✅ Tunnel loading complete, showing preview');
        setIsTunnelLoading(false);
      }, 5000);

      return () => clearTimeout(timer);
    }

    // If tunnel URL was removed
    if (!currentTunnelUrl && lastTunnelUrlRef.current) {
      lastTunnelUrlRef.current = null;
      setIsTunnelLoading(false);
    }
  }, [project?.tunnelUrl]);

  // Construct preview URL - prefer tunnel URL if available, otherwise use localhost directly (bypass proxy)
  const previewUrl = project?.tunnelUrl && project?.devServerStatus === 'running'
    ? project.tunnelUrl
    : (actualPort && isServerReady
      ? `http://localhost:${actualPort}`
      : '');

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
          setHealthCheckFailed(false);
          return;
        }

        if (cancelled) return;
        await new Promise(resolve => setTimeout(resolve, 500));
        if (cancelled) return;
      }

      if (!cancelled) {
        console.error('❌ Server health check failed after multiple attempts');
        setIsChecking(false);
        setHealthCheckFailed(true);
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
    setIsRefreshing(true);
    setKey(prev => prev + 1);
    // Reset after iframe loads
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const handleCopyUrl = async () => {
    const url = project?.tunnelUrl || `http://localhost:${actualPort}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  // Device preset dimensions
  const getDeviceDimensions = () => {
    switch (devicePreset) {
      case 'mobile':
        return { width: '375px', height: '100%' }; // iPhone size
      case 'tablet':
        return { width: '768px', height: '100%' }; // iPad size
      case 'desktop':
      default:
        return { width: '100%', height: '100%' };
    }
  };

  const dimensions = getDeviceDimensions();

  const handleOpenInNewTab = () => {
    // Open tunnel URL if available, otherwise localhost
    if (project?.tunnelUrl) {
      window.open(project.tunnelUrl, '_blank');
    } else if (actualPort) {
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
  const handleElementSelected = useCallback((element: any, prompt: string) => {
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
  }, [addEdit]);

  // Handle comment submission - send to chat as regular generation
  const handleCommentSubmit = useCallback((editId: string, prompt: string) => {
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
  }, [edits, removeEdit]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="h-full flex flex-col bg-[#1e1e1e] border border-[#3e3e3e] rounded-xl shadow-2xl overflow-hidden"
    >
      {/* Browser-like chrome bar */}
      <div className="bg-[#2d2d2d] border-b border-[#3e3e3e] px-3 py-2 flex items-center gap-2">
        {previewUrl ? (
          <>
            {/* Left controls */}
            <div className="flex items-center gap-1">
              {/* Selection Mode Toggle */}
              <SelectionMode
                isEnabled={isSelectionModeEnabled}
                onToggle={setIsSelectionModeEnabled}
                onElementSelected={handleElementSelected}
              />

              {/* Refresh button */}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-1.5 rounded-md hover:bg-white/10 transition-all duration-200 disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* URL bar - Center */}
            <div className="flex-1 flex items-center gap-2 mx-3">
              <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-[#1e1e1e] border border-[#4e4e4e] rounded-md hover:border-[#5e5e5e] transition-colors">
                <div className="w-2 h-2 rounded-full bg-[#92DD00] shadow-lg shadow-[#92DD00]/50 flex-shrink-0"></div>
                <span className="text-xs font-mono text-gray-300 truncate">
                  {project?.tunnelUrl || `http://localhost:${actualPort}`}
                </span>
                <button
                  onClick={handleCopyUrl}
                  className="p-1 rounded hover:bg-white/10 transition-colors flex-shrink-0"
                  title="Copy URL"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-gray-400" />
                  )}
                </button>
              </div>

              {/* Device presets */}
              <div className="flex items-center gap-1 bg-[#1e1e1e] border border-[#4e4e4e] rounded-md p-1">
                <button
                  onClick={() => setDevicePreset('desktop')}
                  className={`p-1.5 rounded transition-all ${
                    devicePreset === 'desktop'
                      ? 'bg-[#7553FF]/20 text-[#7553FF]'
                      : 'text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                  title="Desktop view"
                >
                  <Monitor className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDevicePreset('tablet')}
                  className={`p-1.5 rounded transition-all ${
                    devicePreset === 'tablet'
                      ? 'bg-[#7553FF]/20 text-[#7553FF]'
                      : 'text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                  title="Tablet view (768px)"
                >
                  <Tablet className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDevicePreset('mobile')}
                  className={`p-1.5 rounded transition-all ${
                    devicePreset === 'mobile'
                      ? 'bg-[#7553FF]/20 text-[#7553FF]'
                      : 'text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                  title="Mobile view (375px)"
                >
                  <Smartphone className="w-4 h-4" />
                </button>
              </div>

              {/* Open in new tab */}
              <button
                onClick={handleOpenInNewTab}
                className="p-1.5 rounded-md hover:bg-white/10 transition-all duration-200"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4 text-gray-400" />
              </button>
            </div>

          </>
        ) : (
          <div className="flex-1 text-center">
            <span className="text-sm text-gray-500">No preview available</span>
          </div>
        )}

        {/* Right controls - Server/Tunnel buttons - Always visible */}
        <div className="flex items-center gap-2 ml-auto">
          {project?.runCommand && (
            <>
              {project.devServerStatus === 'running' ? (
                <>
                  {/* Tunnel Controls */}
                  {project.tunnelUrl ? (
                    <button
                      onClick={onStopTunnel}
                      disabled={isStoppingTunnel}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/40 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Stop Cloudflare tunnel"
                    >
                      <Square className={`w-3.5 h-3.5 ${isStoppingTunnel ? 'animate-pulse' : ''}`} />
                      {isStoppingTunnel ? 'Stopping...' : 'Stop Tunnel'}
                    </button>
                  ) : (
                    <button
                      onClick={onStartTunnel}
                      disabled={isStartingTunnel}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Start Cloudflare tunnel for public access"
                    >
                      <Cloud className={`w-3.5 h-3.5 ${isStartingTunnel ? 'animate-pulse' : ''}`} />
                      {isStartingTunnel ? 'Starting...' : 'Start Tunnel'}
                    </button>
                  )}
                  {/* Stop Server Button */}
                  <button
                    onClick={onStopServer}
                    disabled={isStoppingServer}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-[#FF45A8]/20 hover:bg-[#FF45A8]/30 text-[#FF45A8] border border-[#FF45A8]/30 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Square className={`w-3.5 h-3.5 ${isStoppingServer ? 'animate-pulse' : ''}`} />
                    {isStoppingServer ? 'Stopping...' : 'Stop'}
                  </button>
                </>
              ) : (
                <button
                  onClick={onStartServer}
                  disabled={project.devServerStatus === 'starting' || isStartingServer}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-[#92DD00]/20 hover:bg-[#92DD00]/30 text-[#92DD00] border border-[#92DD00]/30 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className={`w-3.5 h-3.5 ${isStartingServer ? 'animate-pulse' : ''}`} />
                  {project.devServerStatus === 'starting' || isStartingServer ? 'Starting...' : 'Start'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex-1 bg-[#1e1e1e] relative flex items-start justify-center overflow-auto">
        {previewUrl ? (
          <>
            {/* Tunnel loading overlay - 5 second delay */}
            {isTunnelLoading && (
              <div className="absolute inset-0 bg-[#1e1e1e]/95 backdrop-blur-sm flex items-center justify-center z-20">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <Cloud className="w-16 h-16 text-blue-400 animate-pulse" />
                    <div className="absolute inset-0 rounded-full border-4 border-blue-400/20 border-t-blue-400 animate-spin"></div>
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-lg font-semibold text-white">Initializing Tunnel</p>
                    <p className="text-sm text-gray-400">Setting up secure connection...</p>
                  </div>
                </div>
              </div>
            )}

            {/* Loading indicator overlay */}
            {isRefreshing && !isTunnelLoading && (
              <div className="absolute inset-0 bg-[#1e1e1e]/80 backdrop-blur-sm flex items-center justify-center z-10">
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="w-8 h-8 text-[#7553FF] animate-spin" />
                  <p className="text-sm text-gray-400">Refreshing preview...</p>
                </div>
              </div>
            )}

            <div
              className="bg-white transition-all duration-300 ease-out"
              style={{
                width: dimensions.width,
                height: dimensions.height,
                maxWidth: '100%',
                boxShadow: devicePreset !== 'desktop' ? '0 0 40px rgba(0,0,0,0.3)' : 'none',
                margin: devicePreset !== 'desktop' ? '20px auto' : '0',
              }}
            >
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
                onLoad={() => setIsRefreshing(false)}
              />

            </div>

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
            {isChecking ? (
              <div className="text-center space-y-3">
                <div className="flex items-center gap-2 justify-center">
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
                <p>Waiting for server to be ready...</p>
              </div>
            ) : healthCheckFailed && project?.devServerStatus === 'running' && !project?.tunnelUrl ? (
              <div className="text-center space-y-4 max-w-md px-6">
                <div className="flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-orange-500/20 flex items-center justify-center">
                    <Cloud className="w-8 h-8 text-orange-400" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-white">Localhost Unreachable</h3>
                  <p className="text-gray-400 text-sm">
                    The dev server is running on <span className="font-mono text-gray-300">localhost:{actualPort}</span> but couldn't be reached from the browser.
                  </p>
                  <p className="text-gray-400 text-sm">
                    Try starting a Cloudflare tunnel for remote access:
                  </p>
                </div>
                <button
                  onClick={onStartTunnel}
                  disabled={isStartingTunnel}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 rounded-lg transition-colors mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Cloud className={`w-5 h-5 ${isStartingTunnel ? 'animate-pulse' : ''}`} />
                  {isStartingTunnel ? 'Starting Tunnel...' : 'Start Cloudflare Tunnel'}
                </button>
              </div>
            ) : project?.devServerStatus === 'running' ? (
              <p>Waiting for dev server...</p>
            ) : project?.status === 'completed' && project?.runCommand ? (
              <div className="text-center space-y-4 max-w-md">
                <div className="flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Rocket className="w-8 h-8 text-green-400" />
                  </div>
                </div>
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
