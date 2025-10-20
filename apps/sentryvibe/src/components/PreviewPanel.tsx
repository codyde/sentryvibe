'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, RefreshCw, Play, Square, Copy, Check, Monitor, Smartphone, Tablet, Cloud, Rocket } from 'lucide-react';
import { useProjects } from '@/contexts/ProjectContext';
import SelectionMode from './SelectionMode';
import ElementComment from './ElementComment';
import { toggleSelectionMode } from '@sentryvibe/agent-core/lib/selection/injector';
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

const PreviewLoadingAnimation = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className="flex flex-col items-center gap-6 text-center">
    <div className="relative flex items-center justify-center">
      <motion.span
        className="absolute w-48 h-48 rounded-full bg-gradient-to-br from-[#7553FF]/35 via-[#FF45A8]/30 to-transparent blur-3xl"
        animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}
      />
      <motion.div
        className="relative w-36 h-36 rounded-full bg-gradient-to-tr from-[#7553FF] via-[#FF45A8] to-[#92DD00] shadow-[0_0_30px_rgba(117,83,255,0.45)]"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 14, ease: 'linear' }}
      >
        <motion.div
          className="absolute inset-4 rounded-full border border-white/20"
          animate={{ rotate: -360 }}
          transition={{ repeat: Infinity, duration: 10, ease: 'linear' }}
        />
        <motion.span
          className="absolute top-3 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.7)]"
          animate={{ y: [0, 10, 0], scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 2.8, ease: 'easeInOut' }}
        />
        <motion.span
          className="absolute bottom-6 right-8 h-2 w-2 rounded-full bg-white/70 shadow-[0_0_14px_rgba(255,255,255,0.6)]"
          animate={{ scale: [1, 1.6, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ repeat: Infinity, duration: 3.4, ease: 'easeInOut' }}
        />
      </motion.div>
    </div>
    <div className="space-y-2">
      <h3 className="text-lg font-semibold text-white tracking-wide">{title}</h3>
      <p className="text-sm text-gray-300/90 max-w-xs mx-auto leading-relaxed">{subtitle}</p>
    </div>
  </div>
);

export default function PreviewPanel({ selectedProject, onStartServer, onStopServer, onStartTunnel, onStopTunnel, terminalPort, isStartingServer, isStoppingServer, isStartingTunnel, isStoppingTunnel }: PreviewPanelProps) {
  const { projects, refetch } = useProjects();
  const [key, setKey] = useState(0);
  const [isSelectionModeEnabled, setIsSelectionModeEnabled] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [devicePreset, setDevicePreset] = useState<DevicePreset>('desktop');
  const [isTunnelLoading, setIsTunnelLoading] = useState(false);
  const [dnsVerificationAttempt, setDnsVerificationAttempt] = useState<number>(0);
  const [dnsTroubleshooting, setDnsTroubleshooting] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { edits, addEdit, removeEdit } = useElementEdits();
  const lastTunnelUrlRef = useRef<string | null>(null);
  const [verifiedTunnelUrl, setVerifiedTunnelUrl] = useState<string | null>(null);

  // Find the current project
  const project = projects.find(p => p.slug === selectedProject);
  const [liveProject, setLiveProject] = useState(project);

  // Use live project data if available (from SSE), otherwise fall back to context
  const currentProject = liveProject || project;

  // Use terminal-detected port if available, otherwise fall back to DB port
  const actualPort = terminalPort || currentProject?.devServerPort;

  // Real-time status updates via SSE
  useEffect(() => {
    if (!project?.id) {
      setLiveProject(undefined);
      return;
    }

    const eventSource = new EventSource(`/api/projects/${project.id}/status-stream`);

    eventSource.onmessage = (event) => {
      // Ignore keepalive pings
      if (event.data === ':keepalive') return;

      try {
        const data = JSON.parse(event.data);
        if (data.type === 'status-update' && data.project) {
          setLiveProject(data.project);
        }
      } catch (err) {
        console.error('Failed to parse SSE status event:', err);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [project?.id]);

  // Fallback polling when SSE fails: Poll during active operations
  useEffect(() => {
    // Poll every 2 seconds while server starting, tunnel starting, or server running without tunnel URL
    const shouldPoll = isStartingServer || isStartingTunnel ||
                      (currentProject?.devServerStatus === 'starting') ||
                      (isStartingTunnel && !currentProject?.tunnelUrl);

    if (!shouldPoll) return;

    const interval = setInterval(() => {
      refetch();
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [isStartingServer, isStartingTunnel, currentProject?.devServerStatus, currentProject?.tunnelUrl, refetch]);

  // Tunnel loading with client-side DNS verification
  useEffect(() => {
    const currentTunnelUrl = currentProject?.tunnelUrl;

    // Show loading while tunnel is being created
    if (isStartingTunnel) {
      setIsTunnelLoading(true);
      setDnsVerificationAttempt(0);
      setDnsTroubleshooting(false); // Clear troubleshooting screen
      return;
    }

    // Verify tunnel URL is resolvable in browser before showing iframe
    // CRITICAL: Don't expose URL to DOM until verified to prevent Chrome DNS prefetch
    if (currentTunnelUrl && currentTunnelUrl !== lastTunnelUrlRef.current) {
      console.log('🔗 Tunnel URL received, starting verification (URL hidden from DOM)');
      lastTunnelUrlRef.current = currentTunnelUrl;
      setIsTunnelLoading(true);
      setVerifiedTunnelUrl(null); // Clear old verified URL - keeps iframe blank
      setDnsVerificationAttempt(0);

      // Verify browser can actually reach the tunnel
      (async () => {
        const maxAttempts = 10; // 10 attempts × 3s = 30 seconds max
        let resolved = false;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            console.log(`   🔍 DNS check attempt ${attempt}/${maxAttempts}...`);
            setDnsVerificationAttempt(attempt);

            // IMPORTANT: Use the actual URL (no cache-bust on verification)
            // We want to know when the REAL URL resolves, not a cache-busted variant
            await fetch(currentTunnelUrl, {
              method: 'HEAD',
              mode: 'no-cors',
              cache: 'no-store',
              // Force DNS re-resolution on each attempt
              headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
              },
            });

            console.log(`✅ Browser DNS verified in ${attempt} attempt(s)`);
            resolved = true;

            // Wait an extra 2 seconds after DNS resolves to let Chrome's cache update
            console.log('⏳ Waiting 2 extra seconds for Chrome DNS cache refresh...');
            await new Promise(r => setTimeout(r, 2000));

            // NOW expose the URL to the DOM
            console.log('✅ Exposing verified URL to iframe');
            setVerifiedTunnelUrl(currentTunnelUrl);
            setDnsVerificationAttempt(maxAttempts); // Show complete
            setIsTunnelLoading(false);
            return;
          } catch (error: any) {
            console.log(`   ⏳ Attempt ${attempt} failed: ${error.message}`);

            // Wait 3 seconds between attempts
            if (attempt < maxAttempts) {
              await new Promise(r => setTimeout(r, 3000));
            }
          }
        }

        if (!resolved) {
          console.error(`❌ Tunnel DNS verification timeout after 30s (${maxAttempts} attempts)`);
          console.error('   This may be a Chrome DNS cache issue.');

          // Show troubleshooting screen instead of loading iframe
          setDnsTroubleshooting(true);
          setIsTunnelLoading(false);
          // Don't set verifiedTunnelUrl - keep it null so iframe doesn't load
          return;
        }
        setIsTunnelLoading(false);
        setDnsTroubleshooting(false);
      })();

      return;
    }

    // Clear verified URL if tunnel was removed
    if (!currentTunnelUrl && lastTunnelUrlRef.current) {
      lastTunnelUrlRef.current = null;
      setVerifiedTunnelUrl(null);
      setIsTunnelLoading(false);
      setDnsTroubleshooting(false);
      setDnsVerificationAttempt(0);
    }

    // Hide loading if not starting
    if (!isStartingTunnel) {
      setIsTunnelLoading(false);
    }
  }, [currentProject?.tunnelUrl, isStartingTunnel]);

  // Detect if server is running on a remote runner (not local machine)
  // Remote runners typically have runnerId != 'local'
  const isRemoteRunner = currentProject?.runnerId && currentProject.runnerId !== 'local';
  const needsTunnel = isRemoteRunner && actualPort && currentProject?.devServerStatus === 'running' && !currentProject?.tunnelUrl;

  // Construct preview URL - prefer VERIFIED tunnel URL, otherwise use proxy route
  // Use verifiedTunnelUrl (only set after DNS check passes) instead of currentProject.tunnelUrl
  // This prevents iframe from loading before DNS propagates
  const previewUrl = verifiedTunnelUrl && currentProject?.devServerStatus === 'running'
    ? verifiedTunnelUrl
    : (actualPort && currentProject?.devServerStatus === 'running' && currentProject?.id && !isRemoteRunner
      ? `/api/projects/${currentProject.id}/proxy?path=/`
      : '');


  const handleRefresh = () => {
    setIsRefreshing(true);
    setKey(prev => prev + 1);
    // Reset after iframe loads
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const handleCopyUrl = async () => {
    // Copy the actual tunnel URL (might not be verified yet, but that's ok for copy)
    // User can paste it and wait, or use it elsewhere
    const url = currentProject?.tunnelUrl || verifiedTunnelUrl || `http://localhost:${actualPort}`;
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
    if (currentProject?.tunnelUrl) {
      window.open(currentProject.tunnelUrl, '_blank');
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
                  {verifiedTunnelUrl || `http://localhost:${actualPort}`}
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
          {currentProject?.runCommand && (
            <>
              {currentProject.devServerStatus === 'running' ? (
                <>
                  {/* Tunnel Controls */}
                  {currentProject.tunnelUrl ? (
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
                  disabled={currentProject.devServerStatus === 'starting' || isStartingServer}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-[#92DD00]/20 hover:bg-[#92DD00]/30 text-[#92DD00] border border-[#92DD00]/30 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className={`w-3.5 h-3.5 ${isStartingServer ? 'animate-pulse' : ''}`} />
                  {currentProject.devServerStatus === 'starting' || isStartingServer ? 'Starting...' : 'Start'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex-1 bg-[#1e1e1e] relative flex items-start justify-center overflow-auto">
        {previewUrl || isTunnelLoading || dnsTroubleshooting ? (
          <>
            {/* DNS Troubleshooting overlay */}
            {dnsTroubleshooting && (
              <div className="absolute inset-0 bg-[#1e1e1e]/95 backdrop-blur-sm flex items-center justify-center z-20 p-6">
                <div className="max-w-lg w-full bg-[#2d2d2d] rounded-xl p-8 space-y-6">
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 rounded-full bg-orange-500/20 flex items-center justify-center mx-auto mb-4">
                      <Cloud className="w-8 h-8 text-orange-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-white">DNS Resolution Issue</h3>
                    <p className="text-sm text-gray-400">
                      Your browser's DNS cache is preventing the tunnel from loading. Follow these steps to resolve:
                    </p>
                  </div>

                  <div className="space-y-4">
                    {/* Step 1: Run DNS flush commands */}
                    <div className="bg-[#1e1e1e] rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-sm font-semibold">1</div>
                        <p className="text-sm font-medium text-white">Run these commands in Terminal</p>
                      </div>

                      <div className="relative group">
                        <code className="block bg-black/50 rounded px-3 py-2 text-xs font-mono text-gray-300 whitespace-pre overflow-x-auto">
                          sudo dscacheutil -flushcache{'\n'}sudo killall -HUP mDNSResponder
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText('sudo dscacheutil -flushcache\nsudo killall -HUP mDNSResponder');
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                          className="absolute right-2 top-2 p-1.5 rounded bg-blue-500/20 hover:bg-blue-500/30 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Copy commands"
                        >
                          {copied ? (
                            <Check className="w-3.5 h-3.5 text-green-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-blue-400" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500">
                        Paste this in Terminal and press Enter
                      </p>
                    </div>

                    {/* Step 2: Reload page */}
                    <div className="bg-[#1e1e1e] rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-sm font-semibold">2</div>
                        <p className="text-sm font-medium text-white">Reload the page</p>
                      </div>

                      <button
                        onClick={() => {
                          // Reload iframe only (not full page)
                          setDnsTroubleshooting(false);
                          setKey(prev => prev + 1); // Force iframe reload
                          setDnsVerificationAttempt(0);
                          // Re-run verification
                          if (currentProject?.tunnelUrl) {
                            lastTunnelUrlRef.current = null;
                            setVerifiedTunnelUrl(null);
                            setIsTunnelLoading(true);
                          }
                        }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 rounded-lg transition-colors font-medium"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Reload Preview
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 text-center">
                    After running the DNS commands, click "Reload Preview" to retry the tunnel connection.
                  </p>
                </div>
              </div>
            )}

            {/* Tunnel loading overlay with attempt counter */}
            {isTunnelLoading && !dnsTroubleshooting && (
              <div className="absolute inset-0 bg-[#1e1e1e]/95 backdrop-blur-sm flex items-center justify-center z-20">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <Cloud className="w-16 h-16 text-blue-400 animate-pulse" />
                    <div className="absolute inset-0 rounded-full border-4 border-blue-400/20 border-t-blue-400 animate-spin"></div>
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-lg font-semibold text-white">
                      {dnsVerificationAttempt > 0 ? 'Verifying Tunnel Connection' : 'Initializing Tunnel'}
                    </p>
                    <p className="text-sm text-gray-400">
                      {dnsVerificationAttempt > 0
                        ? `Attempt ${dnsVerificationAttempt}/10...`
                        : 'Setting up secure connection...'}
                    </p>
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
                onLoad={(e) => {
                  setIsRefreshing(false);
                  console.log('✅ Iframe loaded:', previewUrl);

                  // Check for error pages
                  const iframe = e.currentTarget;
                  setTimeout(() => {
                    try {
                      const doc = iframe.contentDocument || iframe.contentWindow?.document;
                      if (doc) {
                        const bodyText = doc.body?.innerText?.substring(0, 100);
                        if (bodyText?.includes('Application error') || bodyText?.includes('502') || bodyText?.includes('503')) {
                          console.error('🚨 Preview loaded error page:', bodyText);
                        } else {
                          console.log('📄 Preview content loaded successfully');
                        }
                      }
                    } catch (err) {
                      console.log('⚠️  Cross-origin iframe (cannot inspect content)');
                    }
                  }, 500);
                }}
                onError={(e) => {
                  console.error('🚨 Iframe error event:', e);
                }}
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
            {project?.devServerStatus === 'starting' || isStartingServer ? (
              <PreviewLoadingAnimation
                title="Spinning up your workspace"
                subtitle="Warming caches, allocating a port, and preparing the dev server."
              />
            ) : needsTunnel ? (
              <div className="text-center space-y-4 max-w-md px-6">
                <div className="flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <Cloud className="w-8 h-8 text-blue-400" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-white">Server Running on Remote Runner</h3>
                  <p className="text-gray-400 text-sm">
                    Your dev server is running on <span className="font-mono text-gray-300">localhost:{actualPort}</span> on runner <span className="font-mono text-blue-300">{currentProject.runnerId}</span>.
                  </p>
                  <p className="text-gray-400 text-sm">
                    Start a Cloudflare tunnel to connect:
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
