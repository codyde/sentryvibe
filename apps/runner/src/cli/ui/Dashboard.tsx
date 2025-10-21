/**
 * Main TUI Dashboard Component
 * Shows real-time status of all services with keyboard controls
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { ServiceManager, ServiceState } from './service-manager.js';
import { StatusBar } from './components/StatusBar.js';
import { ServicePanel } from './components/ServicePanel.js';
import { LogViewer } from './components/LogViewer.js';
import { useProjects } from './hooks/useProjects.js';

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

export function Dashboard({ serviceManager, apiUrl, webPort }: DashboardProps) {
  const { exit } = useApp();
  const [view, setView] = useState<ViewMode>('dashboard');
  const [services, setServices] = useState<ServiceState[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [isShuttingDown, setIsShuttingDown] = useState(false);

  // Fetch projects periodically
  const { projects } = useProjects(apiUrl, 5000);

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
        // Keep last 1000 log entries
        return newLogs.slice(-1000);
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
      // Switch to logs view
      setView('logs');
    } else if (input === '?') {
      // Show help
      setView('help');
    } else if (key.escape) {
      // Go back to dashboard
      setView('dashboard');
    }
  });

  // Count running services
  const runningCount = services.filter(s => s.status === 'running').length;
  const totalCount = services.length;
  const allRunning = runningCount === totalCount;

  return (
    <Box flexDirection="column">
      {/* Status Bar */}
      <StatusBar
        services={services}
        allRunning={allRunning}
        isShuttingDown={isShuttingDown}
      />

      {/* Main Content - Fixed height to prevent screen pushing */}
      <Box height={25}>
        {view === 'dashboard' && (
          <Box flexDirection="row" width="100%">
            <ServicePanel
              services={services}
              selected={selectedService}
              onSelect={setSelectedService}
              projects={projects.map(p => ({
                name: p.name,
                status: p.devServerStatus === 'running' ? 'running' : p.status
              }))}
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
          />
        )}

        {view === 'help' && (
          <Box padding={2} flexDirection="column">
            <Text bold>Keyboard Shortcuts</Text>
            <Text></Text>
            <Text><Text color="cyan">q</Text> or <Text color="cyan">Ctrl+C</Text> - Quit and stop all services</Text>
            <Text><Text color="cyan">r</Text> - Restart all services</Text>
            <Text><Text color="cyan">c</Text> - Clear logs</Text>
            <Text><Text color="cyan">l</Text> - View full logs</Text>
            <Text><Text color="cyan">?</Text> - Show this help</Text>
            <Text><Text color="cyan">Esc</Text> - Return to dashboard</Text>
            <Text></Text>
            <Text dimColor>Press Esc to return to dashboard</Text>
          </Box>
        )}
      </Box>

      {/* Footer with keyboard hints */}
      <Box borderStyle="single" borderTop paddingX={1}>
        <Text dimColor>
          {isShuttingDown ? (
            <Text color="yellow">Shutting down...</Text>
          ) : (
            <>
              <Text color="cyan">q</Text> quit  <Text color="cyan">r</Text> restart  <Text color="cyan">c</Text> clear  <Text color="cyan">l</Text> logs  <Text color="cyan">?</Text> help
            </>
          )}
        </Text>
      </Box>
    </Box>
  );
}
