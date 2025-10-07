'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Terminal, X } from 'lucide-react';
import Convert from 'ansi-to-html';
import { useProjects } from '@/contexts/ProjectContext';

interface ParsedLogEntry {
  text: string;
  replaceLast: boolean;
}

const MAX_LOG_ENTRIES = 1000;

function parseLogChunk(chunk: string): ParsedLogEntry[] {
  const entries: ParsedLogEntry[] = [];
  const normalized = chunk.replace(/\r\n/g, '\n');

  let current = '';
  let replaceLast = false;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (char === '\r') {
      if (current) {
        entries.push({ text: current, replaceLast });
        current = '';
      }

      replaceLast = true;
      continue;
    }

    if (char === '\n') {
      if (current) {
        entries.push({ text: current, replaceLast });
        current = '';
      }

      replaceLast = false;
      continue;
    }

    current += char;
  }

  if (current) {
    entries.push({ text: current, replaceLast });
  }

  return entries;
}

interface TerminalOutputProps {
  projectId?: string | null;
  onPortDetected?: (port: number | null) => void;
}

export default function TerminalOutput({ projectId, onPortDetected }: TerminalOutputProps) {
  const { projects } = useProjects();
  const [logs, setLogs] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [detectedPort, setDetectedPort] = useState<number | null>(null);
  const detectedPortRef = useRef<number | null>(null);
  const lastNotifiedPortRef = useRef<number | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pendingLogsRef = useRef<ParsedLogEntry[]>([]);
  const flushScheduledRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const converter = useRef(new Convert({
    fg: '#d4d4d4',
    bg: '#1e1e1e',
    newline: true,
    escapeXML: true,
  }));

  // Get current project to watch dev server status
  const currentProject = projects.find(p => p.id === projectId);
  const devServerStatus = currentProject?.devServerStatus;

  // Debug: Log component mount and projectId changes
  useEffect(() => {
    console.log('🖥️  TerminalOutput mounted, projectId:', projectId);
  }, []);

  useEffect(() => {
    console.log('🔄 TerminalOutput projectId changed:', projectId);
    if (projectId) {
      detectedPortRef.current = null;
      lastNotifiedPortRef.current = null;
      setDetectedPort(null);
      startStreaming();
    } else {
      stopStreaming();
      setLogs([]);
    }

    return () => stopStreaming();
  }, [projectId]);

  const lastStatusRef = useRef<string | null>(null);

  // Reconnect stream across dev server lifecycle states
  useEffect(() => {
    console.log('🔄 Dev server status changed:', devServerStatus);

    const prevStatus = lastStatusRef.current;

    if (!projectId) {
      if (eventSourceRef.current || prevStatus !== null) {
        stopStreaming();
        setLogs([]);
      }
      lastStatusRef.current = null;
      return;
    }

    const currentStatus = devServerStatus || null;

    if (currentStatus === 'starting') {
      if (prevStatus !== 'starting') {
        stopStreaming();
        setLogs([]);
        console.log('🔌 Dev server starting, attaching terminal stream...');
        startStreaming();
      } else if (!eventSourceRef.current) {
        startStreaming();
      }
    } else if (currentStatus === 'running') {
      if (!eventSourceRef.current) {
        console.log('🔌 Dev server running, ensuring terminal stream attached');
        startStreaming();
      }
    } else if (currentStatus === 'stopped' || currentStatus === 'failed' || currentStatus === null) {
      if (eventSourceRef.current || prevStatus !== currentStatus) {
        console.log('🛑 Dev server stopped/failed (or unknown), closing terminal stream');
        stopStreaming();
        setLogs([]);
      }
    }

    lastStatusRef.current = currentStatus;
  }, [devServerStatus, projectId]);

  const startStreaming = () => {
    if (!projectId) return;

    // Don't create duplicate connections
    if (eventSourceRef.current) {
      console.log('   ⚠️  Stream already exists, skipping');
      return;
    }

    console.log('📡 Starting terminal stream for project:', projectId);

    try {
      const url = `/api/projects/${projectId}/logs?stream=true`;
      console.log('   URL:', url);
      const eventSource = new EventSource(url);

      eventSource.onopen = () => {
        console.log('✅ Terminal stream connected');
        setIsStreaming(true);
      };

      eventSource.onmessage = (event) => {
        console.log('📨 Received log event:', event.data);
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'log' && data.data) {
            enqueueLogs(data.data);
          } else if (data.type === 'exit') {
            setLogs((prev) => [...prev, '\n--- Process exited ---\n']);
            stopStreaming();
          } else if (data.type === 'no-process') {
            console.log('ℹ️  No process running');
            stopStreaming(false);
            setTimeout(() => {
              if (!eventSourceRef.current && projectId) {
                console.log('🔁 Retrying terminal connection after no-process response');
                startStreaming();
              }
            }, 1000);
          }
        } catch (e) {
          console.error('Failed to parse log event:', e);
        }
      };

      eventSource.onerror = (error) => {
        // EventSource errors are normal when server stops - don't spam console
        const readyState = eventSource.readyState;

        if (readyState === EventSource.CLOSED) {
          console.log('ℹ️  Terminal stream closed (server stopped or process ended)');
          stopStreaming(false);
          setTimeout(() => {
            if (!eventSourceRef.current && projectId) {
              console.log('🔁 Retrying terminal connection after close');
              startStreaming();
            }
          }, 1000);
        } else if (readyState === EventSource.CONNECTING) {
          console.log('🔄 Terminal stream reconnecting...');
        } else {
          console.error('❌ EventSource error:', error);
          console.error('   ReadyState:', readyState);
          stopStreaming(false);
          setTimeout(() => {
            if (!eventSourceRef.current && projectId) {
              console.log('🔁 Retrying terminal connection after error');
              startStreaming();
            }
          }, 1500);
        }
      };

      eventSourceRef.current = eventSource;
    } catch (error) {
      console.error('Failed to start log streaming:', error);
    }
  };

  const stopStreaming = (resetPort: boolean = true) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    flushScheduledRef.current = false;
    pendingLogsRef.current = [];
    if (resetPort) {
      detectedPortRef.current = null;
      lastNotifiedPortRef.current = null;
      setDetectedPort(null);
    }
    setIsStreaming(false);
  };

  const fetchLogsAsFallback = async () => {
    if (!projectId) return;

    console.log('🔄 Using fallback: fetching logs via JSON API');
    try {
      const res = await fetch(`/api/projects/${projectId}/logs`);
      const data = await res.json();

      if (data.running && data.logs) {
        setLogs(data.logs);
      }
    } catch (error) {
      console.error('Fallback fetch failed:', error);
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const enqueueLogs = (chunk: string) => {
    const entries = parseLogChunk(chunk);
    if (!entries.length) return;

    // Store for batched flush
    pendingLogsRef.current.push(...entries);

    if (!flushScheduledRef.current) {
      flushScheduledRef.current = true;
      rafIdRef.current = requestAnimationFrame(() => {
        flushScheduledRef.current = false;
        rafIdRef.current = null;

        if (pendingLogsRef.current.length === 0) {
          return;
        }

        setLogs((prev) => {
          if (pendingLogsRef.current.length === 0) {
            return prev;
          }

          let next = [...prev];
          let changed = false;

          for (const entry of pendingLogsRef.current) {
            const text = entry.text;
            if (!text) continue;

            if (entry.replaceLast) {
              if (next.length === 0) {
                next = [text];
                changed = true;
              } else if (next[next.length - 1] !== text) {
                next[next.length - 1] = text;
                changed = true;
              }
            } else {
              next.push(text);
              changed = true;
            }

            if (detectedPortRef.current == null) {
              detectPort(text);
            }
          }

          pendingLogsRef.current = [];

          if (!changed) {
            return prev;
          }

          if (next.length > MAX_LOG_ENTRIES) {
            next = next.slice(next.length - MAX_LOG_ENTRIES);
          }

          return next;
        });
      });
    }
  };

  const detectPort = (logText: string) => {
    if (detectedPortRef.current != null) return;

    // Skip lines mentioning ports that are "in use" or "busy"
    if (logText.match(/in use|busy|unavailable|already/i)) {
      console.log('⏭️  Skipping "in use" port message:', logText.trim());
      return;
    }

    const portMatch =
      logText.match(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})/i) ||        // URL with port
      logText.match(/Local:.*?:(\d{4,5})/i) ||                                    // Vite/Next: "Local: http://localhost:5173/"
      logText.match(/port[:\s]+(\d{4,5})/i) ||                                    // Generic "Port 3000"
      logText.match(/ready.*?(\d{4,5})/i) ||                                      // "ready - started server on 3000"
      logText.match(/ready.*?:(\d{4,5})/i) ||                                     // "ready on http://localhost:3000"
      logText.match(/http:\/\/.*?:(\d{4,5})/i) ||                                 // Any HTTP URL
      logText.match(/https:\/\/.*?:(\d{4,5})/i) ||                                // Any HTTPS URL
      logText.match(/Network:.*?:(\d{4,5})/i) ||                                  // Vite Network URL
      logText.match(/started server on.*?:(\d{4,5})/i) ||                         // Next.js format
      logText.match(/listening on.*?:(\d{4,5})/i);                                // Generic "listening on"

    if (portMatch) {
      const port = parseInt(portMatch[1], 10);
      if (port >= 3000 && port <= 65535) {
        if (detectedPortRef.current !== port) {
          console.log(`🔍 Port detected from terminal: ${port}`);
          detectedPortRef.current = port;
          setDetectedPort(port);
        }
      }
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (detectedPort == null) return;
    if (lastNotifiedPortRef.current === detectedPort) return;
    lastNotifiedPortRef.current = detectedPort;
    if (onPortDetected) {
      onPortDetected(detectedPort);
    }
  }, [detectedPort, onPortDetected]);

  useEffect(() => {
    if (detectedPort !== null) return;
    if (lastNotifiedPortRef.current === null) return;
    lastNotifiedPortRef.current = null;
    if (onPortDetected) {
      onPortDetected(null);
    }
  }, [detectedPort, onPortDetected]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="h-full flex flex-col bg-black/20 backdrop-blur-md border border-white/10 rounded-xl shadow-xl overflow-hidden"
    >
      {/* Header */}
      <div className="border-b border-white/10 p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-green-400" />
          <h3 className="text-sm font-medium text-white">Terminal Output</h3>
          {isStreaming && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 animate-pulse">
              Live
            </span>
          )}
        </div>
        <button
          onClick={clearLogs}
          disabled={logs.length === 0}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Clear logs"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      </div>

      {/* Terminal Content */}
      <div className="flex-1 overflow-y-auto p-4 bg-[#1e1e1e] font-mono text-sm">
        {/* Debug info */}
        <div className="text-xs text-gray-600 mb-2">
          ProjectID: {projectId || 'none'} | Streaming: {isStreaming ? 'yes' : 'no'} | Logs: {logs.length}
        </div>

        {logs.length === 0 ? (
          <div className="text-gray-500">
            {projectId ? 'No output yet. Start the dev server to see logs.' : 'Select a project to view terminal output'}
          </div>
        ) : (
          <div className="space-y-0.5">
            {logs.map((log, i) => (
              <div
                key={i}
                className="text-gray-300 whitespace-pre-wrap break-words"
                dangerouslySetInnerHTML={{
                  __html: converter.current.toHtml(log),
                }}
              />
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    </motion.div>
  );
}
