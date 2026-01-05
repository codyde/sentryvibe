/**
 * Main TUI Dashboard Component
 * Shows real-time status of all services with keyboard controls
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { readFile } from 'node:fs/promises';
import { ServiceManager, ServiceState } from './service-manager.js';
import { Banner } from './components/Banner.js';
import { StatusBox } from './components/StatusBox.js';

interface DashboardProps {
  serviceManager: ServiceManager;
  apiUrl: string;
  webPort: number;
  logFilePath: string;
}

type ViewMode = 'dashboard' | 'help';

interface LogEntry {
  timestamp: Date;
  service: string;
  message: string;
  stream: 'stdout' | 'stderr';
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false });
}

function getServiceColor(service: string): string {
  switch (service) {
    case 'web':
      return 'blue';
    case 'broker':
      return 'green';
    case 'runner':
      return 'magenta';
    default:
      return 'white';
  }
}

export function Dashboard({ serviceManager, apiUrl, webPort, logFilePath }: DashboardProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [view, setView] = useState<ViewMode>('dashboard');
  const [services, setServices] = useState<ServiceState[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [showingPlainLogs, setShowingPlainLogs] = useState(false);
  const [serviceFilter, setServiceFilter] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Calculate available height for logs
  // Banner ~7 lines, StatusBox ~9 lines, Footer ~2 lines, margins ~3 = 21 lines overhead
  const terminalHeight = stdout?.rows || 40;
  const logAreaHeight = Math.max(5, terminalHeight - 21);

  // Update service states on changes
  useEffect(() => {
    const handleStatusChange = () => {
      setServices(serviceManager.getAllStates());
    };

    // Initial state
    setServices(serviceManager.getAllStates());

    // Listen to service status changes
    serviceManager.on('service:status-change', handleStatusChange);

    return () => {
      serviceManager.off('service:status-change', handleStatusChange);
    };
  }, [serviceManager]);

  // Poll log file every 3 seconds
  useEffect(() => {
    let lastLineCount = 0;
    let isMounted = true;

    const readLogFile = async () => {
      if (!isMounted) return;

      try {
        const content = await readFile(logFilePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        // Only process new lines
        if (lines.length > lastLineCount) {
          const newLines = lines.slice(lastLineCount);
          const newLogs: LogEntry[] = [];

          for (const line of newLines) {
            // Parse log format: [timestamp] [service] [stream] message
            const match = line.match(/^\[([^\]]+)\] \[([^\]]+)\] \[([^\]]+)\] (.+)$/);
            if (match) {
              newLogs.push({
                timestamp: new Date(match[1]),
                service: match[2] as any,
                stream: match[3] as 'stdout' | 'stderr',
                message: match[4]
              });
            }
          }

          if (newLogs.length > 0 && isMounted) {
            setLogs(prev => {
              const combined = [...prev, ...newLogs];
              return combined.slice(-10000); // Keep last 10000
            });
          }

          lastLineCount = lines.length;
        }
      } catch (err) {
        // File might not exist yet, ignore
      }
    };

    // Read immediately
    readLogFile();

    // Then poll every 3 seconds
    const interval = setInterval(() => {
      if (isMounted) readLogFile();
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [logFilePath]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll) {
      setScrollOffset(0);
    }
  }, [logs.length, autoScroll]);

  // Keyboard shortcuts
  useInput((input, key) => {
    // Prevent actions during shutdown
    if (isShuttingDown) return;

    // Handle Esc in search mode to exit
    if (searchMode && key.escape) {
      setSearchMode(false);
      setSearchQuery('');
      return;
    }

    // Don't process other keys when in search mode (TextInput handles them)
    if (searchMode) return;

    if (input === '/' && !showingPlainLogs) {
      // Enter search mode
      setSearchMode(true);
      setSearchQuery('');
      return;
    }

    if (input === 'q' || (key.ctrl && input === 'c')) {
      // Quit
      setIsShuttingDown(true);
      serviceManager.stopAll().then(() => {
        exit();
      });
    } else if (input === 'r') {
      // Restart all
      serviceManager.restartAll();
    } else if (input === 'c') {
      // Clear logs
      setLogs([]);
      setScrollOffset(0);
      setAutoScroll(true);
    } else if (input === 'l') {
      // Toggle plain text log view
      setShowingPlainLogs(!showingPlainLogs);
    } else if (input === 'f') {
      // Cycle through service filters: null -> 'web' -> 'broker' -> 'runner' -> null
      setServiceFilter(current => {
        if (!current) return 'web';
        if (current === 'web') return 'broker';
        if (current === 'broker') return 'runner';
        return null;
      });
    } else if (key.upArrow) {
      // Scroll up
      setAutoScroll(false);
      setScrollOffset(prev => Math.min(prev + 1, filteredLogs.length - logAreaHeight));
    } else if (key.downArrow) {
      // Scroll down
      const newOffset = Math.max(scrollOffset - 1, 0);
      setScrollOffset(newOffset);
      if (newOffset === 0) {
        setAutoScroll(true);
      }
    } else if (key.pageUp) {
      // Scroll up by page
      setAutoScroll(false);
      setScrollOffset(prev => Math.min(prev + logAreaHeight, filteredLogs.length - logAreaHeight));
    } else if (key.pageDown) {
      // Scroll down by page
      const newOffset = Math.max(scrollOffset - logAreaHeight, 0);
      setScrollOffset(newOffset);
      if (newOffset === 0) {
        setAutoScroll(true);
      }
    } else if (input === 'g') {
      // Jump to top
      setAutoScroll(false);
      setScrollOffset(Math.max(filteredLogs.length - logAreaHeight, 0));
    } else if (input === 'G') {
      // Jump to bottom (resume auto-scroll)
      setScrollOffset(0);
      setAutoScroll(true);
    } else if (input === 't') {
      // Toggle tunnel for web app
      const webService = services.find(s => s.name === 'web');
      if (webService?.tunnelStatus === 'active') {
        // Tunnel is active, close it
        serviceManager.closeTunnel('web').catch(err => {
          // Error will be shown in service panel
        });
      } else if (!webService?.tunnelStatus || webService.tunnelStatus === 'failed') {
        // No tunnel or failed, create one
        serviceManager.createTunnel('web').catch(err => {
          // Error will be shown in service panel
        });
      }
      // If creating, ignore (don't interrupt)
    } else if (input === '?') {
      // Show help
      setView('help');
    } else if (key.escape) {
      // Exit search mode, plain logs mode, or go back to dashboard
      if (searchMode) {
        setSearchMode(false);
        setSearchQuery(''); // Clear search when canceling
      } else if (showingPlainLogs) {
        setShowingPlainLogs(false);
      } else {
        setView('dashboard');
      }
    }
  });

  // Get tunnel URL from web service
  const webService = services.find(s => s.name === 'web');
  const tunnelUrl = webService?.tunnelUrl || null;

  // Filter logs based on service filter and search query (memoized to prevent recalculation on every render)
  const filteredLogs = useMemo(() => {
    let filtered = logs;

    // Apply service filter
    if (serviceFilter) {
      filtered = filtered.filter(log => log.service === serviceFilter);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(query) ||
        log.service.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [logs, serviceFilter, searchQuery]);

  // Calculate which logs to show based on scroll offset (memoized)
  const visibleLogs = useMemo(() => {
    const startIndex = Math.max(0, filteredLogs.length - logAreaHeight - scrollOffset);
    const endIndex = filteredLogs.length - scrollOffset;
    return filteredLogs.slice(startIndex, endIndex);
  }, [filteredLogs, logAreaHeight, scrollOffset]);

  // Plain logs mode - show ALL logs as plain text for easy copy/paste
  if (showingPlainLogs) {
    return (
      <Box flexDirection="column">
        <Box borderBottom paddingX={1} paddingY={0}>
          <Text bold>All Logs</Text>
          <Text dimColor> (showing all {logs.length} entries - scroll with terminal)</Text>
        </Box>
        <Box borderBottom paddingX={1} paddingY={0}>
          <Text dimColor>Press </Text>
          <Text color="cyan">Esc</Text>
          <Text dimColor> to return to dashboard • Use terminal scroll or Cmd+F to search</Text>
        </Box>
        <Box flexDirection="column" paddingX={1} paddingY={1}>
          {logs.map((log, index) => (
            <Text key={index}>
              {formatTime(log.timestamp)} [{log.service}] {log.message}
            </Text>
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Banner - Fixed at top */}
      <Banner />

      {/* Status Box - Fixed, shows current service status */}
      <StatusBox services={services} tunnelUrl={tunnelUrl} />

      {/* Logs Section - Scrollable area with reserved height */}
      {view === 'dashboard' && (
        <Box flexDirection="column" marginTop={1} minHeight={logAreaHeight}>
          {visibleLogs.length > 0 ? (
            visibleLogs.map((log, index) => (
              <Box key={`${log.timestamp.getTime()}-${index}`}>
                <Text dimColor>{formatTime(log.timestamp)}</Text>
                <Text> </Text>
                <Text color={getServiceColor(log.service)}>[{log.service}]</Text>
                <Text> </Text>
                <Text color={log.stream === 'stderr' ? 'yellow' : undefined}>
                  {log.message.length > 150 ? log.message.substring(0, 150) + '...' : log.message}
                </Text>
              </Box>
            ))
          ) : filteredLogs.length === 0 && logs.length > 0 ? (
            <Box justifyContent="center" minHeight={logAreaHeight}>
              <Text dimColor>No logs matching filter "{serviceFilter}"</Text>
            </Box>
          ) : (
            <Box justifyContent="center" minHeight={logAreaHeight}>
              <Text dimColor>No logs yet... Waiting for service output.</Text>
            </Box>
          )}
        </Box>
      )}

      {view === 'help' && (
        <Box padding={2} flexDirection="column">
          <Text bold>Keyboard Shortcuts</Text>
          <Text></Text>
          <Text bold>General:</Text>
          <Text>  <Text color="cyan">q</Text> or <Text color="cyan">Ctrl+C</Text> - Quit and stop all services</Text>
          <Text>  <Text color="cyan">r</Text> - Restart all services</Text>
          <Text>  <Text color="cyan">t</Text> - Toggle Cloudflare tunnel (create/close)</Text>
          <Text>  <Text color="cyan">c</Text> - Clear logs</Text>
          <Text>  <Text color="cyan">l</Text> - Toggle plain text log view (for copy/paste)</Text>
          <Text>  <Text color="cyan">f</Text> - Filter logs by service (cycles through all/web/broker/runner)</Text>
          <Text>  <Text color="cyan">/</Text> - Search logs (type to filter, Enter to apply, Esc to cancel)</Text>
          <Text>  <Text color="cyan">?</Text> - Show this help</Text>
          <Text>  <Text color="cyan">Esc</Text> - Exit search/help and return to dashboard</Text>
          <Text></Text>
          <Text bold>Log Navigation:</Text>
          <Text>  <Text color="cyan">↑/↓</Text> - Scroll logs up/down</Text>
          <Text>  <Text color="cyan">PageUp/PageDown</Text> - Scroll by page</Text>
          <Text>  <Text color="cyan">g</Text> - Jump to top (oldest logs)</Text>
          <Text>  <Text color="cyan">G</Text> - Jump to bottom (newest logs, resume auto-scroll)</Text>
          <Text></Text>
          <Text dimColor>Press Esc to return to dashboard</Text>
        </Box>
      )}

      {/* Footer - Shows at bottom */}
      <Box borderTop paddingX={1} paddingY={0}>
        {searchMode ? (
          <Box>
            <Text color="cyan">/</Text>
            <TextInput
              value={searchQuery}
              onChange={setSearchQuery}
              onSubmit={() => setSearchMode(false)}
              placeholder="Search logs... (Enter to search, Esc to cancel)"
            />
          </Box>
        ) : (
          <Text dimColor>
            {isShuttingDown ? (
              <Text color="yellow">Shutting down...</Text>
            ) : view === 'help' ? (
              <>
                <Text color="cyan">Esc</Text> dashboard  <Text color="cyan">q</Text> quit
              </>
            ) : (
              <>
                {serviceFilter && (
                  <>
                    <Text color="cyan">Filter:</Text> <Text color="yellow">{serviceFilter}</Text>  <Text dimColor>|</Text>{' '}
                  </>
                )}
                {searchQuery && (
                  <>
                    <Text color="cyan">Search:</Text> <Text color="yellow">{searchQuery}</Text>  <Text dimColor>|</Text>{' '}
                  </>
                )}
                {!autoScroll && (
                  <>
                    <Text color="magenta">SCROLLED</Text>  <Text dimColor>|</Text>{' '}
                  </>
                )}
                <Text color="cyan">/</Text> search  <Text color="cyan">↑↓</Text> scroll  <Text color="cyan">g/G</Text> top/bottom  <Text color="cyan">q</Text> quit  <Text color="cyan">r</Text> restart  <Text color="cyan">t</Text> tunnel  <Text color="cyan">c</Text> clear  <Text color="cyan">f</Text> filter  <Text color="cyan">?</Text> help
              </>
            )}
          </Text>
        )}
      </Box>
    </Box>
  );
}
