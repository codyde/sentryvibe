'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Terminal, X } from 'lucide-react';
import Convert from 'ansi-to-html';
import { useProjects } from '@/contexts/ProjectContext';

interface TerminalOutputProps {
  projectId?: string | null;
  onPortDetected?: (port: number) => void;
}

export default function TerminalOutput({ projectId, onPortDetected }: TerminalOutputProps) {
  const { projects } = useProjects();
  const [logs, setLogs] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [detectedPort, setDetectedPort] = useState<number | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
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
      startStreaming();
    } else {
      stopStreaming();
      setLogs([]);
    }

    return () => stopStreaming();
  }, [projectId]);

  // Reconnect stream when dev server starts - with retry logic
  useEffect(() => {
    console.log('🔄 Dev server status changed:', devServerStatus);

    if (devServerStatus === 'running' && projectId) {
      console.log('🔌 Dev server started, setting up terminal connection...');
      stopStreaming();
      setLogs([]); // Clear old logs from previous run

      // Retry with progressive delays to handle race condition
      const retryTimeouts: NodeJS.Timeout[] = [];
      const delays = [500, 1500, 3000]; // 0.5s, 1.5s, 3s

      delays.forEach((delay, index) => {
        const timeoutId = setTimeout(() => {
          console.log(`   Retry attempt ${index + 1}/${delays.length}`);
          startStreaming();
        }, delay);
        retryTimeouts.push(timeoutId);
      });

      // Cleanup timeouts on unmount or status change
      return () => {
        retryTimeouts.forEach(clearTimeout);
      };
    } else if (devServerStatus === 'stopped' || devServerStatus === 'failed') {
      console.log('🛑 Dev server stopped/failed, closing stream and clearing logs');
      stopStreaming();
      setLogs([]); // Clear terminal when server stops
    }
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
            setLogs((prev) => [...prev, data.data]);

            // Parse port from log output
            const logText = data.data;
            if (!detectedPort) {
              const portMatch =
                logText.match(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})/i) ||
                logText.match(/port[:\s]+(\d{4,5})/i) ||
                logText.match(/Local:.*?:(\d{4,5})/i) ||
                logText.match(/ready.*?(\d{4,5})/i);

              if (portMatch) {
                const port = parseInt(portMatch[1], 10);
                if (port >= 3000 && port <= 65535) {
                  console.log(`🔍 Port detected from terminal: ${port}`);
                  setDetectedPort(port);
                  if (onPortDetected) {
                    onPortDetected(port);
                  }
                }
              }
            }
          } else if (data.type === 'exit') {
            setIsStreaming(false);
            setLogs((prev) => [...prev, '\n--- Process exited ---\n']);
            setDetectedPort(null);
          } else if (data.type === 'no-process') {
            console.log('ℹ️  No process running');
            stopStreaming();
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
          stopStreaming();
        } else if (readyState === EventSource.CONNECTING) {
          console.log('🔄 Terminal stream reconnecting...');
        } else {
          console.error('❌ EventSource error:', error);
          console.error('   ReadyState:', readyState);
          stopStreaming();
        }
      };

      eventSourceRef.current = eventSource;
    } catch (error) {
      console.error('Failed to start log streaming:', error);
    }
  };

  const stopStreaming = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
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

  // Auto-scroll to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

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
