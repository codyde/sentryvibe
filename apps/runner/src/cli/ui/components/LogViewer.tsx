/**
 * LogViewer Component - Scrollable log display with filtering
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';

interface LogEntry {
  timestamp: Date;
  service: string;
  message: string;
  stream: 'stdout' | 'stderr';
}

interface LogViewerProps {
  logs: LogEntry[];
  selectedService: string | null;
  fullScreen?: boolean;
  maxHeight?: number; // Fixed height to prevent screen pushing
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

export function LogViewer({ logs, selectedService, fullScreen, maxHeight }: LogViewerProps) {
  const [scrollOffset, setScrollOffset] = useState(0);
  // Use provided maxHeight or defaults
  const maxVisibleLogs = maxHeight || (fullScreen ? 40 : 20);

  // Filter logs by selected service
  const filteredLogs = selectedService
    ? logs.filter(log => log.service === selectedService)
    : logs;

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    setScrollOffset(Math.max(0, filteredLogs.length - maxVisibleLogs));
  }, [filteredLogs.length, maxVisibleLogs]);

  // Get visible logs
  const visibleLogs = filteredLogs.slice(scrollOffset, scrollOffset + maxVisibleLogs);

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle={fullScreen ? 'single' : undefined}
      paddingX={1}
      paddingY={1}
    >
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="cyan">
          {selectedService ? `${selectedService} logs` : 'All Logs'}
        </Text>
        <Text dimColor>
          {filteredLogs.length} entries
        </Text>
      </Box>

      {/* Log entries */}
      <Box flexDirection="column" flexGrow={1}>
        {visibleLogs.length === 0 ? (
          <Box flexGrow={1} justifyContent="center" alignItems="center">
            <Text dimColor>No logs yet...</Text>
          </Box>
        ) : (
          visibleLogs.map((log, index) => (
            <Box key={scrollOffset + index}>
              <Text dimColor>{formatTime(log.timestamp)}</Text>
              <Text> </Text>
              <Text color={getServiceColor(log.service)}>[{log.service}]</Text>
              <Text> </Text>
              <Text color={log.stream === 'stderr' ? 'yellow' : undefined}>
                {log.message.length > 120 ? log.message.substring(0, 120) + '...' : log.message}
              </Text>
            </Box>
          ))
        )}
      </Box>

      {/* Scroll indicator */}
      {filteredLogs.length > maxVisibleLogs && (
        <Box borderStyle="single" borderTop paddingTop={1} justifyContent="center">
          <Text dimColor>
            {scrollOffset + 1}-{Math.min(scrollOffset + maxVisibleLogs, filteredLogs.length)} of {filteredLogs.length}
            {' • Showing latest'}
          </Text>
        </Box>
      )}
    </Box>
  );
}
