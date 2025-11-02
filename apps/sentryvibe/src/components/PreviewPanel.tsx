'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, RefreshCw, Play, Square, Copy, Check, Monitor, Smartphone, Tablet, Cloud, Rocket, Github } from 'lucide-react';
import { useProjects } from '@/contexts/ProjectContext';
import SelectionMode from './SelectionMode';
import ElementComment from './ElementComment';
import { toggleSelectionMode } from '@sentryvibe/agent-core/lib/selection/injector';
import { useElementEdits } from '@/hooks/useElementEdits';
import AsciiLoadingAnimation from './AsciiLoadingAnimation';
import * as Sentry from '@sentry/nextjs';

interface PreviewPanelProps {
  selectedProject?: string | null;
  onStartServer?: () => void;
  onStopServer?: () => void;
  onStartTunnel?: () => void;
  onStopTunnel?: () => void;
  isStartingServer?: boolean;
  isStoppingServer?: boolean;
  isStartingTunnel?: boolean;
  isStoppingTunnel?: boolean;
  isBuildActive?: boolean;
}

type DevicePreset = 'desktop' | 'tablet' | 'mobile';

const DEBUG_PREVIEW = false; // Set to true to enable verbose preview panel logging

export default function PreviewPanel({ selectedProject, onStartServer, onStopServer, onStartTunnel, onStopTunnel, isStartingServer, isStoppingServer, isStartingTunnel, isStoppingTunnel, isBuildActive }: PreviewPanelProps) {
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
  
  // GitHub repo creation state
  const [isCreatingGithubRepo, setIsCreatingGithubRepo] = useState(false);
  const [githubRepoUrl, setGithubRepoUrl] = useState<string | null>(null);
  const [githubRepoStatus, setGithubRepoStatus] = useState<'idle' | 'creating' | 'completed' | 'failed'>('idle');

  // Find the current project
  const project = projects.find(p => p.slug === selectedProject);
  const [liveProject, setLiveProject] = useState(project);

  // Use live project data if available (from SSE), otherwise fall back to context
  const currentProject = liveProject || project;

  // Port comes from database (pre-allocated in start route)
  const actualPort = currentProject?.devServerPort;

  // Track SSE connection health
  const [isSSEConnected, setIsSSEConnected] = useState(false);
  const sseFailureCountRef = useRef(0);

  // Real-time status updates via SSE
  useEffect(() => {
    if (!project?.id) {
      setLiveProject(undefined);
      setIsSSEConnected(false);
      return;
    }

    const eventSource = new EventSource(`/api/projects/${project.id}/status-stream`);

    eventSource.onopen = () => {
      setIsSSEConnected(true);
      sseFailureCountRef.current = 0;
    };

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
      setIsSSEConnected(false);
      sseFailureCountRef.current++;
      eventSource.close();
    };

    return () => {
      setIsSSEConnected(false);
      eventSource.close();
    };
  }, [project?.id]);

  // Fallback polling ONLY when SSE fails: Poll during active operations
  useEffect(() => {
    // Only poll if SSE has failed multiple times (not just temporarily disconnected)
    if (isSSEConnected || sseFailureCountRef.current < 2) return;

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
  }, [isSSEConnected, isStartingServer, isStartingTunnel, currentProject?.devServerStatus, currentProject?.tunnelUrl, refetch]);

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
      if (DEBUG_PREVIEW) console.log('🔗 Tunnel URL received, starting verification (URL hidden from DOM)');
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
            if (DEBUG_PREVIEW) console.log(`   🔍 DNS check attempt ${attempt}/${maxAttempts}...`);
            setDnsVerificationAttempt(attempt);

            // IMPORTANT: Use the actual URL (no cache-bust on verification)
            // We want to know when the REAL URL resolves, not a cache-busted variant
            // NOTE: Do not set custom request headers when using `mode: 'no-cors'` -
            // browsers will reject the request with a TypeError ("Failed to fetch").
            // Use an AbortController to bound the check time and rely on the
            // opaque response from `no-cors` to indicate reachability.
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            try {
              await fetch(currentTunnelUrl, {
                method: 'HEAD',
                mode: 'no-cors',
                cache: 'no-store',
                signal: controller.signal,
              });
            } finally {
              clearTimeout(timeoutId);
            }

            if (DEBUG_PREVIEW) console.log(`✅ Browser DNS verified in ${attempt} attempt(s)`);
            resolved = true;

            // Wait an extra 2 seconds after DNS resolves to let Chrome's cache update
            if (DEBUG_PREVIEW) console.log('⏳ Waiting 2 extra seconds for Chrome DNS cache refresh...');
            await new Promise(r => setTimeout(r, 2000));

            // NOW expose the URL to the DOM and reload iframe
            if (DEBUG_PREVIEW) console.log('✅ Exposing verified URL to iframe');
            setVerifiedTunnelUrl(currentTunnelUrl);
            setDnsVerificationAttempt(maxAttempts); // Show complete
            setIsTunnelLoading(false);

            // Force iframe to reload with tunnel-proxied content
            setKey(prev => prev + 1);
            if (DEBUG_PREVIEW) console.log('🔄 Reloading iframe with tunnel URL');
            return;
          } catch (error: any) {
            if (DEBUG_PREVIEW) console.log(`   ⏳ Attempt ${attempt} failed: ${error.message}`);

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

  // Detect if frontend is being accessed remotely (not localhost)
  const frontendIsRemote = typeof window !== 'undefined' &&
    !window.location.hostname.includes('localhost') &&
    !window.location.hostname.includes('127.0.0.1');

  // Detect if server is running on a remote runner (not local machine)
  // Remote runners typically have runnerId != 'local'
  const isRemoteRunner = currentProject?.runnerId && currentProject.runnerId !== 'local';
  const isLocalRunner = !isRemoteRunner;
  const needsTunnel = frontendIsRemote && actualPort && currentProject?.devServerStatus === 'running' && !currentProject?.tunnelUrl;

  // Auto-create tunnel when remote frontend detects server started (only once per server start)
  const hasAutoStartedTunnel = useRef(false);

  useEffect(() => {
    // Reset flag when server stops
    if (currentProject?.devServerStatus !== 'running') {
      hasAutoStartedTunnel.current = false;
    }

    // Debug auto-tunnel logic
    console.log('[PreviewPanel] Auto-tunnel check:', {
      needsTunnel,
      onStartTunnel: !!onStartTunnel,
      isStartingTunnel,
      hasAutoStarted: hasAutoStartedTunnel.current,
      willCreate: needsTunnel && onStartTunnel && !isStartingTunnel && !hasAutoStartedTunnel.current
    });

    // Auto-start tunnel when:
    // - Remote frontend (Railway)
    // - Server just started
    // - No tunnel exists
    // - Haven't already auto-started for this server session
    if (needsTunnel && onStartTunnel && !isStartingTunnel && !hasAutoStartedTunnel.current) {
      console.log('🔗 Remote frontend detected - auto-creating tunnel...');
      hasAutoStartedTunnel.current = true;
      onStartTunnel();
    }
  }, [needsTunnel, onStartTunnel, isStartingTunnel, currentProject?.devServerStatus]);

  // Construct preview URL - ALWAYS use proxy route for script injection
  // Proxy will intelligently route to tunnel (remote) or localhost (local)
  // This ensures selection mode works in all scenarios

  // For remote frontend: Only show preview if tunnel exists OR is being created
  // For local frontend: Always show (can access localhost)
  const canShowPreview = actualPort && currentProject?.devServerStatus === 'running' && currentProject?.id &&
    (!frontendIsRemote || currentProject?.tunnelUrl || isTunnelLoading);
    // Show if: Local frontend (always) OR tunnel exists OR tunnel being created

  // Debug logging
  if (DEBUG_PREVIEW && currentProject?.devServerStatus === 'running') {
    console.log('[PreviewPanel] Can show preview?', {
      canShowPreview,
      actualPort,
      devServerStatus: currentProject?.devServerStatus,
      frontendIsRemote,
      tunnelUrl: currentProject?.tunnelUrl,
      isTunnelLoading,
      needsTunnel,
    });
  }

  const previewUrl = canShowPreview
    ? `/api/projects/${currentProject.id}/proxy?path=/`
    : '';

  // Note: Proxy intelligently routes based on Host header:
  // - Local frontend: Fetches from localhost (fast, no tunnel needed)
  // - Remote frontend: Fetches from tunnel (requires tunnel to exist)


  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setKey(prev => prev + 1);
    // Reset after iframe loads
    setTimeout(() => setIsRefreshing(false), 1000);
  }, []);

  // Listen for refresh requests (e.g., after element changes complete)
  useEffect(() => {
    const handleRefreshEvent = () => {
      handleRefresh();
    };

    window.addEventListener('refresh-iframe', handleRefreshEvent);
    return () => window.removeEventListener('refresh-iframe', handleRefreshEvent);
  }, [handleRefresh]);

  const handleCopyUrl = async () => {
    // Copy the actual URL (tunnel for remote, localhost for local)
    const url = isLocalRunner
      ? `http://localhost:${actualPort}`
      : (verifiedTunnelUrl || currentProject?.tunnelUrl || `http://localhost:${actualPort}`);

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

  // Auto-sync inspector state when iframe loads or script announces ready
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data.type === 'sentryvibe:ready') {
        if (DEBUG_PREVIEW) console.log('📦 Iframe script ready, syncing inspector state:', isSelectionModeEnabled);
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

    if (DEBUG_PREVIEW) console.log('📍 Creating comment:', {
      rawClick: element.clickPosition,
      adjusted: position,
    });

    const editId = addEdit(element, prompt, position);
    if (DEBUG_PREVIEW) console.log('✅ Created edit:', editId);
  }, [addEdit]);

  // Handle comment submission - send to chat as regular generation
  const handleCommentSubmit = useCallback((editId: string, prompt: string) => {
    if (DEBUG_PREVIEW) console.log('🚀 Submitting element change:', editId, prompt);

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

    if (DEBUG_PREVIEW) console.log('✅ Sent to chat system');
  }, [edits, removeEdit]);

  // GitHub repo creation handlers
  const handleCreateGithubRepo = useCallback(async () => {
    if (!currentProject?.id || isCreatingGithubRepo || isBuildActive) return;

    setIsCreatingGithubRepo(true);
    setGithubRepoStatus('creating');

    try {
      Sentry.addBreadcrumb({
        category: 'github-repo',
        message: 'User initiated GitHub repo creation',
        level: 'info',
        data: {
          projectId: currentProject.id,
          projectSlug: currentProject.slug,
        },
      });

      // Get applied tags from the current project
      let appliedTags: any[] = [];
      if (currentProject.tags) {
        try {
          appliedTags = typeof currentProject.tags === 'string' 
            ? JSON.parse(currentProject.tags) 
            : currentProject.tags;
        } catch (e) {
          console.error('[github-repo] Failed to parse tags:', e);
          Sentry.captureException(e, {
            tags: {
              component: 'PreviewPanel',
              operation: 'github-repo-creation',
              step: 'parse-tags',
            },
            extra: {
              projectId: currentProject.id,
            },
          });
        }
      }

      const response = await fetch(`/api/projects/${currentProject.id}/github-repo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tags: appliedTags,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`Failed to create GitHub repository: ${response.status} ${errorText}`);
        
        Sentry.captureException(error, {
          tags: {
            component: 'PreviewPanel',
            operation: 'github-repo-creation',
            step: 'api-request',
          },
          extra: {
            projectId: currentProject.id,
            responseStatus: response.status,
            responseText: errorText,
          },
        });
        
        throw error;
      }

      Sentry.addBreadcrumb({
        category: 'github-repo',
        message: 'GitHub repo creation request successful, polling for completion',
        level: 'info',
        data: {
          projectId: currentProject.id,
        },
      });

      // Poll for completion
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(`/api/projects/${currentProject.id}/github-repo`);
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (statusData.github?.status === 'completed' && statusData.github?.repoUrl) {
              setGithubRepoUrl(statusData.github.repoUrl);
              setGithubRepoStatus('completed');
              setIsCreatingGithubRepo(false);
              clearInterval(pollInterval);
              
              Sentry.addBreadcrumb({
                category: 'github-repo',
                message: 'GitHub repo creation completed',
                level: 'info',
                data: {
                  projectId: currentProject.id,
                  repoUrl: statusData.github.repoUrl,
                },
              });
            } else if (statusData.github?.status === 'failed') {
              setGithubRepoStatus('failed');
              setIsCreatingGithubRepo(false);
              clearInterval(pollInterval);
              
              Sentry.captureMessage('GitHub repo creation failed', {
                level: 'warning',
                tags: {
                  component: 'PreviewPanel',
                  operation: 'github-repo-creation',
                },
                extra: {
                  projectId: currentProject.id,
                  error: statusData.github?.error,
                },
              });
            }
          }
        } catch (pollError) {
          console.error('[github-repo] Error polling status:', pollError);
          Sentry.captureException(pollError, {
            tags: {
              component: 'PreviewPanel',
              operation: 'github-repo-creation',
              step: 'poll-status',
            },
            extra: {
              projectId: currentProject.id,
            },
          });
        }
      }, 3000);

      // Clean up interval after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        if (isCreatingGithubRepo) {
          setIsCreatingGithubRepo(false);
          setGithubRepoStatus('failed');
          
          Sentry.captureMessage('GitHub repo creation timed out', {
            level: 'warning',
            tags: {
              component: 'PreviewPanel',
              operation: 'github-repo-creation',
            },
            extra: {
              projectId: currentProject.id,
              timeoutMinutes: 5,
            },
          });
        }
      }, 300000);
    } catch (error) {
      console.error('[github-repo] Error creating repository:', error);
      setGithubRepoStatus('failed');
      setIsCreatingGithubRepo(false);
      
      Sentry.captureException(error, {
        tags: {
          component: 'PreviewPanel',
          operation: 'github-repo-creation',
          step: 'create-handler',
        },
        extra: {
          projectId: currentProject?.id,
        },
      });
    }
  }, [currentProject, isCreatingGithubRepo, isBuildActive]);

  const handleOpenGithubRepo = useCallback(() => {
    if (githubRepoUrl) {
      Sentry.addBreadcrumb({
        category: 'github-repo',
        message: 'User opened GitHub repository',
        level: 'info',
        data: {
          projectId: currentProject?.id,
          repoUrl: githubRepoUrl,
        },
      });
      window.open(githubRepoUrl, '_blank');
    }
  }, [githubRepoUrl, currentProject?.id]);

  // Check for existing GitHub repo status on mount
  useEffect(() => {
    if (!currentProject?.id) return;

    const checkGithubStatus = async () => {
      try {
        const response = await fetch(`/api/projects/${currentProject.id}/github-repo`);
        if (response.ok) {
          const data = await response.json();
          if (data.github) {
            setGithubRepoStatus(data.github.status || 'idle');
            if (data.github.repoUrl) {
              setGithubRepoUrl(data.github.repoUrl);
            }
            if (data.github.status === 'creating') {
              setIsCreatingGithubRepo(true);
              
              Sentry.addBreadcrumb({
                category: 'github-repo',
                message: 'Found in-progress GitHub repo creation',
                level: 'info',
                data: {
                  projectId: currentProject.id,
                  status: data.github.status,
                },
              });
            }
          }
        } else {
          throw new Error(`Failed to fetch GitHub status: ${response.status}`);
        }
      } catch (error) {
        console.error('[github-repo] Error checking status:', error);
        Sentry.captureException(error, {
          tags: {
            component: 'PreviewPanel',
            operation: 'github-repo-creation',
            step: 'check-initial-status',
          },
          extra: {
            projectId: currentProject.id,
          },
        });
      }
    };

    checkGithubStatus();
  }, [currentProject?.id]);

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
                <div className="w-2 h-2 rounded-full bg-[#92DD00] shadow-lg shadow-[#92DD00]/50 shrink-0"></div>
                <span className="text-xs font-mono text-gray-300 truncate">
                  {isLocalRunner
                    ? `http://localhost:${actualPort}`
                    : (verifiedTunnelUrl || `http://localhost:${actualPort}`)}
                </span>
                <button
                  onClick={handleCopyUrl}
                  className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
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

              {/* Open buttons */}
              <div className="flex items-center gap-1">
                {/* Open Tunnel URL */}
                {verifiedTunnelUrl && (
                  <button
                    onClick={() => window.open(verifiedTunnelUrl, '_blank')}
                    className="p-1.5 rounded-md hover:bg-blue-500/20 transition-all duration-200 group"
                    title="Open tunnel URL in new tab"
                  >
                    <Cloud className="w-4 h-4 text-blue-400 group-hover:text-blue-300" />
                  </button>
                )}

                {/* Open Localhost */}
                {actualPort && (
                  <button
                    onClick={() => window.open(`http://localhost:${actualPort}`, '_blank')}
                    className="p-1.5 rounded-md hover:bg-green-500/20 transition-all duration-200 group"
                    title="Open localhost in new tab"
                  >
                    <Monitor className="w-4 h-4 text-green-400 group-hover:text-green-300" />
                  </button>
                )}
              </div>
            </div>

          </>
        ) : (
          <div className="flex-1 text-center">
            <span className="text-sm text-gray-500">No preview available</span>
          </div>
        )}

        {/* Right controls - Server/Tunnel buttons - Always visible */}
        <div className="flex items-center gap-2 ml-auto">
          {/* GitHub Repo Button - Always visible when project exists */}
          {currentProject && (
            <>
              {githubRepoStatus === 'completed' && githubRepoUrl ? (
                <button
                  onClick={handleOpenGithubRepo}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 rounded-md transition-colors"
                  title="Open GitHub repository"
                >
                  <Github className="w-3.5 h-3.5" />
                  View Repo
                </button>
              ) : (
                <button
                  onClick={handleCreateGithubRepo}
                  disabled={isCreatingGithubRepo || isBuildActive || githubRepoStatus === 'creating'}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-gray-500/20 hover:bg-gray-500/30 text-gray-300 border border-gray-500/40 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={isBuildActive ? 'Wait for build to complete' : 'Create GitHub repository'}
                >
                  <Github className={`w-3.5 h-3.5 ${isCreatingGithubRepo ? 'animate-pulse' : ''}`} />
                  {isCreatingGithubRepo || githubRepoStatus === 'creating' ? 'Creating...' : 'Create Repo'}
                </button>
              )}
            </>
          )}

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
                      {dnsVerificationAttempt > 0
                        ? 'Verifying Tunnel Connection'
                        : (frontendIsRemote ? 'Creating Tunnel for Remote Access' : 'Initializing Tunnel')}
                    </p>
                    <p className="text-sm text-gray-400">
                      {dnsVerificationAttempt > 0
                        ? `Attempt ${dnsVerificationAttempt}/10...`
                        : (frontendIsRemote
                          ? 'Tunnel required for remote access...'
                          : 'Setting up secure connection...')}
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
                  if (DEBUG_PREVIEW) console.log('✅ Iframe loaded:', previewUrl);

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
                          if (DEBUG_PREVIEW) console.log('📄 Preview content loaded successfully');
                        }
                      }
                    } catch (err) {
                      if (DEBUG_PREVIEW) console.log('⚠️  Cross-origin iframe (cannot inspect content)');
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
            {isBuildActive ? (
              <div className="text-center flex items-center justify-center">
                <div className="max-w-[400px]">
                  <AsciiLoadingAnimation />
                </div>
              </div>
            ) : currentProject?.devServerStatus === 'starting' || isStartingServer ? (
              <div className="flex flex-col items-center gap-4">
                <div className="relative flex items-center justify-center w-24 h-24">
                  <Rocket className="w-16 h-16 text-purple-400 animate-pulse" />
                  <div className="absolute inset-0 rounded-full border-4 border-purple-400/20 border-t-purple-400 animate-spin"></div>
                </div>
                <div className="text-center space-y-2">
                  <p className="text-lg font-semibold text-white">
                    Spinning up your workspace
                  </p>
                  <p className="text-sm text-gray-400">
                    Warming caches, allocating a port, and preparing the dev server.
                  </p>
                </div>
              </div>
            ) : frontendIsRemote && actualPort && currentProject?.devServerStatus === 'running' && !currentProject?.tunnelUrl ? (
              <div className="text-center space-y-4 max-w-md px-6">
                <div className="flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <Cloud className="w-8 h-8 text-blue-400" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-white">Tunnel Disconnected</h3>
                  <p className="text-gray-400 text-sm">
                    Server is running on <span className="font-mono text-gray-300">localhost:{actualPort}</span> but tunnel was stopped.
                  </p>
                  <p className="text-gray-400 text-sm">
                    Restart tunnel to access remotely:
                  </p>
                </div>
                <button
                  onClick={onStartTunnel}
                  disabled={isStartingTunnel}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 rounded-lg transition-colors mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Cloud className={`w-5 h-5 ${isStartingTunnel ? 'animate-pulse' : ''}`} />
                  {isStartingTunnel ? 'Starting Tunnel...' : 'Restart Tunnel'}
                </button>
              </div>
            ) : currentProject?.status === 'completed' && currentProject?.runCommand ? (
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
