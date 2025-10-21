/**
 * Main TUI Dashboard Component
 * Shows real-time status of all services with keyboard controls
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { ServiceManager, ServiceState } from './service-manager.js';
import { Banner } from './components/Banner.js';
import { StatusBar } from './components/StatusBar.js';
import { ServicePanel } from './components/ServicePanel.js';
import { LogViewer } from './components/LogViewer.js';

interface DashboardProps {
  serviceManager: ServiceManager;
  apiUrl: string;
  webPort: number;
}

type ViewMode = 'dashboard' | 'logs' | 'help';

interface LogEntry {
  timestamp: Date;
  service: string;
  message: string;
  stream: 'stdout' | 'stderr';
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false });
}

export function Dashboard({ serviceManager, apiUrl, webPort }: DashboardProps) {
  const { exit } = useApp();
  const [view, setView] = useState<ViewMode>('dashboard');
  const [services, setServices] = useState<ServiceState[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [showingPlainLogs, setShowingPlainLogs] = useState(false);

  // Update service states on changes
  useEffect(() => {
    const handleStatusChange = () => {
      setServices(serviceManager.getAllStates());
    };

    const handleOutput = (name: string, output: string, stream: 'stdout' | 'stderr') => {
      setLogs(prev => {
        const newLogs = [
          ...prev,
          {
            timestamp: new Date(),
            service: name,
            message: output.trim(),
            stream,
          }
        ];
        // Keep last 10000 log entries (plenty for a session)
        return newLogs.slice(-10000);
      });
    };

    // Initial state
    setServices(serviceManager.getAllStates());

    // Listen to events
    serviceManager.on('service:status-change', handleStatusChange);
    serviceManager.on('service:output', handleOutput);

    return () => {
      serviceManager.off('service:status-change', handleStatusChange);
      serviceManager.off('service:output', handleOutput);
    };
  }, [serviceManager]);

  // Keyboard shortcuts
  useInput((input, key) => {
    // Prevent actions during shutdown
    if (isShuttingDown) return;

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
    } else if (input === 'l') {
      // Switch to plain text log view (outside TUI for copy/paste)
      setShowingPlainLogs(true);
    } else if (input === 't') {
      // Create tunnel for web app
      serviceManager.createTunnel('web').catch(err => {
        // Error will be shown in service panel
      });
    } else if (input === '?') {
      // Show help
      setView('help');
    } else if (key.escape) {
      // Exit plain logs mode or go back to dashboard
      if (showingPlainLogs) {
        setShowingPlainLogs(false);
      } else {
        setView('dashboard');
      }
    }
  });

  // Count running services
  const runningCount = services.filter(s => s.status === 'running').length;
  const totalCount = services.length;
  const allRunning = runningCount === totalCount;

  // Get tunnel URL from web service
  const webService = services.find(s => s.name === 'web');
  const tunnelUrl = webService?.tunnelUrl || null;

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
      {/* Banner - Part of TUI, stays fixed at top */}
      <Banner />

      {/* Status Bar */}
      <StatusBar
        services={services}
        allRunning={allRunning}
        isShuttingDown={isShuttingDown}
        tunnelUrl={tunnelUrl}
      />

      {/* Main Content - Fixed height to prevent screen pushing */}
      <Box height={25}>
        {view === 'dashboard' && (
          <Box flexDirection="row" width="100%">
            <ServicePanel
              services={services}
              selected={selectedService}
              onSelect={setSelectedService}
            />
            <LogViewer
              logs={logs}
              selectedService={selectedService}
              maxHeight={23}
            />
          </Box>
        )}

        {view === 'logs' && (
          <LogViewer
            logs={logs}
            selectedService={null}
            fullScreen
            maxHeight={23}
          />
        )}

        {view === 'help' && (
          <Box padding={2} flexDirection="column">
            <Text bold>Keyboard Shortcuts</Text>
            <Text></Text>
            <Text bold>General:</Text>
            <Text>  <Text color="cyan">q</Text> or <Text color="cyan">Ctrl+C</Text> - Quit and stop all services</Text>
            <Text>  <Text color="cyan">r</Text> - Restart all services</Text>
            <Text>  <Text color="cyan">t</Text> - Create Cloudflare tunnel (share web app publicly)</Text>
            <Text>  <Text color="cyan">c</Text> - Clear logs</Text>
            <Text>  <Text color="cyan">l</Text> - View full logs</Text>
            <Text>  <Text color="cyan">?</Text> - Show this help</Text>
            <Text>  <Text color="cyan">Esc</Text> - Return to dashboard</Text>
            <Text></Text>
            <Text bold>Log Navigation:</Text>
            <Text>  <Text color="cyan">↑/↓</Text> - Scroll logs line by line</Text>
            <Text>  <Text color="cyan">PageUp/PageDown</Text> - Scroll by page</Text>
            <Text>  <Text color="cyan">g</Text> - Jump to top</Text>
            <Text>  <Text color="cyan">G</Text> - Jump to bottom (resume auto-scroll)</Text>
            <Text></Text>
            <Text dimColor>Press Esc to return to dashboard</Text>
          </Box>
        )}
      </Box>

      {/* Footer with keyboard hints */}
      <Box borderTop paddingX={1} paddingY={0}>
        <Text dimColor>
          {isShuttingDown ? (
            <Text color="yellow">Shutting down...</Text>
          ) : view === 'logs' ? (
            <>
              <Text color="cyan">↑↓</Text> scroll  <Text color="cyan">g/G</Text> top/bottom  <Text color="cyan">Esc</Text> dashboard  <Text color="cyan">q</Text> quit
            </>
          ) : view === 'help' ? (
            <>
              <Text color="cyan">Esc</Text> dashboard  <Text color="cyan">q</Text> quit
            </>
          ) : (
            <>
              <Text color="cyan">q</Text> quit  <Text color="cyan">r</Text> restart  <Text color="cyan">t</Text> tunnel  <Text color="cyan">c</Text> clear  <Text color="cyan">l</Text> logs  <Text color="cyan">?</Text> help
            </>
          )}
        </Text>
      </Box>
    </Box>
  );
}
