/**
 * StatusBox Component - Consolidated service status display
 */

import React from 'react';
import { Box, Text } from 'ink';

interface ServiceState {
  name: string;
  status: 'stopped' | 'starting' | 'running' | 'error';
  port?: number;
  error?: string;
  uptime?: number;
  tunnelUrl?: string;
  tunnelStatus?: 'creating' | 'active' | 'failed';
}

interface StatusBoxProps {
  services: ServiceState[];
  tunnelUrl: string | null;
}

function getStatusIndicator(status: string): { symbol: string; color: string } {
  switch (status) {
    case 'running':
      return { symbol: '⬤', color: 'green' };
    case 'starting':
      return { symbol: '◐', color: 'yellow' };
    case 'error':
      return { symbol: '✗', color: 'red' };
    default:
      return { symbol: '○', color: 'gray' };
  }
}

export function StatusBox({ services, tunnelUrl }: StatusBoxProps) {
  const runningCount = services.filter(s => s.status === 'running').length;
  const totalCount = services.length;

  const webService = services.find(s => s.name === 'web');
  const brokerService = services.find(s => s.name === 'broker');
  const runnerService = services.find(s => s.name === 'runner');

  return (
    <Box
      borderStyle="single"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      flexDirection="column"
    >
      {/* Overall Status */}
      <Box marginBottom={1}>
        <Text bold>
          {runningCount === totalCount ? (
            <Text color="green">⬤ {runningCount}/{totalCount} services running</Text>
          ) : (
            <Text color="yellow">◐ {runningCount}/{totalCount} services running</Text>
          )}
        </Text>
      </Box>

      {/* Web Service */}
      {webService && (
        <Box>
          <Text color={getStatusIndicator(webService.status).color}>
            {getStatusIndicator(webService.status).symbol}
          </Text>
          <Text> </Text>
          <Text bold>Web:</Text>
          <Text> </Text>
          {webService.status === 'running' && webService.port ? (
            <Text color="blue">http://localhost:{webService.port}</Text>
          ) : (
            <Text dimColor>{webService.status}</Text>
          )}
        </Box>
      )}

      {/* Broker Service */}
      {brokerService && (
        <Box>
          <Text color={getStatusIndicator(brokerService.status).color}>
            {getStatusIndicator(brokerService.status).symbol}
          </Text>
          <Text> </Text>
          <Text bold>Broker:</Text>
          <Text> </Text>
          {brokerService.status === 'running' && brokerService.port ? (
            <Text color="green">ws://localhost:{brokerService.port}</Text>
          ) : (
            <Text dimColor>{brokerService.status}</Text>
          )}
        </Box>
      )}

      {/* Runner Service */}
      {runnerService && (
        <Box>
          <Text color={getStatusIndicator(runnerService.status).color}>
            {getStatusIndicator(runnerService.status).symbol}
          </Text>
          <Text> </Text>
          <Text bold>Runner:</Text>
          <Text> </Text>
          <Text dimColor>
            {runnerService.status === 'running' ? 'Active' : runnerService.status}
          </Text>
        </Box>
      )}

      {/* Tunnel Status */}
      <Box marginTop={1}>
        <Text bold>Tunnel:</Text>
        <Text> </Text>
        {tunnelUrl ? (
          <Text color="magenta">{tunnelUrl}</Text>
        ) : (
          <Text dimColor>inactive (press 't' to create)</Text>
        )}
      </Box>
    </Box>
  );
}
