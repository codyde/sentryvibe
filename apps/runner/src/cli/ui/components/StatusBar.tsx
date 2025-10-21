/**
 * StatusBar Component - Top bar showing overall system status
 */

import React from 'react';
import { Box, Text } from 'ink';
import { ServiceState } from '../service-manager.js';

interface StatusBarProps {
  services: ServiceState[];
  allRunning: boolean;
  isShuttingDown: boolean;
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function StatusBar({ services, allRunning, isShuttingDown }: StatusBarProps) {
  const runningCount = services.filter(s => s.status === 'running').length;
  const totalCount = services.length;
  const errorCount = services.filter(s => s.status === 'error').length;

  // Calculate total uptime (max of all services)
  const maxUptime = Math.max(...services.map(s => s.uptime || 0));

  return (
    <Box
      borderStyle="single"
      borderBottom
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        <Text bold> SentryVibe </Text>
        <Text dimColor> | </Text>
        {isShuttingDown ? (
          <Text color="yellow">Shutting down...</Text>
        ) : allRunning ? (
          <Text color="green">● Running</Text>
        ) : errorCount > 0 ? (
          <Text color="red">✗ Error</Text>
        ) : (
          <Text color="yellow">⠋ Starting...</Text>
        )}
      </Box>

      <Box>
        <Text dimColor>
          Services: <Text color={runningCount === totalCount ? 'green' : 'yellow'}>
            {runningCount}/{totalCount}
          </Text>
        </Text>
        {maxUptime > 0 && (
          <>
            <Text dimColor> | </Text>
            <Text dimColor>Uptime: {formatUptime(maxUptime)}</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
