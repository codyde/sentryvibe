/**
 * StatusBox Component - Centered service status display
 * Matches the init TUI style with fixed width box
 */

import React from 'react';
import { Box, Text } from 'ink';

// Theme colors
const colors = {
  cyan: '#06b6d4',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  dimGray: '#4b5563',
  white: '#ffffff',
};

// Match the stepper width from init TUI
const BOX_WIDTH = 61;

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
}

function getStatusIndicator(status: string): { statusSymbol: string; statusColor: string } {
  switch (status) {
    case 'running':
      return { statusSymbol: '✓', statusColor: colors.success };
    case 'starting':
      return { statusSymbol: '◐', statusColor: colors.warning };
    case 'error':
      return { statusSymbol: '✗', statusColor: colors.error };
    default:
      return { statusSymbol: '○', statusColor: colors.dimGray };
  }
}

export function StatusBox({ services }: StatusBoxProps) {
  const webService = services.find(s => s.name === 'web');
  const brokerService = services.find(s => s.name === 'broker');
  const runnerService = services.find(s => s.name === 'runner');

  // Build content lines
  const lines: Array<{ label: string; value: string; valueColor: string; statusColor: string; statusSymbol: string }> = [];
  
  if (webService) {
    lines.push({
      label: 'Web',
      value: webService.status === 'running' && webService.port 
        ? `http://localhost:${webService.port}` 
        : webService.status,
      valueColor: webService.status === 'running' ? colors.cyan : colors.dimGray,
      ...getStatusIndicator(webService.status),
    });
  }
  
  if (brokerService) {
    lines.push({
      label: 'Broker',
      value: brokerService.status === 'running' && brokerService.port 
        ? `ws://localhost:${brokerService.port}` 
        : brokerService.status,
      valueColor: brokerService.status === 'running' ? colors.success : colors.dimGray,
      ...getStatusIndicator(brokerService.status),
    });
  }
  
  if (runnerService) {
    lines.push({
      label: 'Runner',
      value: runnerService.status === 'running' ? 'Active' : runnerService.status,
      valueColor: runnerService.status === 'running' ? colors.white : colors.dimGray,
      ...getStatusIndicator(runnerService.status),
    });
  }

  return (
    <Box flexDirection="column" alignItems="center" marginTop={1}>
      <Box flexDirection="column" width={BOX_WIDTH}>
        {/* Top border */}
        <Text color={colors.dimGray}>┌{'─'.repeat(BOX_WIDTH - 2)}┐</Text>
        
        {/* Content lines */}
        {lines.map((line, index) => {
          const content = `${line.statusSymbol} ${line.label}: ${line.value}`;
          const paddingNeeded = Math.max(0, BOX_WIDTH - 4 - content.length);
          
          return (
            <Box key={index}>
              <Text color={colors.dimGray}>│ </Text>
              <Text color={line.statusColor}>{line.statusSymbol}</Text>
              <Text color={colors.white}> {line.label}: </Text>
              <Text color={line.valueColor}>{line.value}</Text>
              <Text>{' '.repeat(paddingNeeded)}</Text>
              <Text color={colors.dimGray}> │</Text>
            </Box>
          );
        })}
        
        {/* Bottom border */}
        <Text color={colors.dimGray}>└{'─'.repeat(BOX_WIDTH - 2)}┘</Text>
      </Box>
    </Box>
  );
}
