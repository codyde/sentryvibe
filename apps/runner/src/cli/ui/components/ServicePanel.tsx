/**
 * ServicePanel Component - Shows status of each service
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { ServiceState } from '../service-manager.js';

interface ServicePanelProps {
  services: ServiceState[];
  selected: string | null;
  onSelect: (name: string | null) => void;
  projects?: Array<{ name: string; status: string }>; // Project list from database
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);

  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getStatusIcon(status: ServiceState['status']): React.ReactNode {
  switch (status) {
    case 'running':
      return <Text color="green">●</Text>;
    case 'starting':
      return <Text color="yellow"><Spinner type="dots" /></Text>;
    case 'stopped':
      return <Text dimColor>○</Text>;
    case 'error':
      return <Text color="red">✗</Text>;
  }
}

export function ServicePanel({ services, selected, onSelect, projects }: ServicePanelProps) {
  return (
    <Box
      flexDirection="column"
      width="20%"
      minWidth={30}
      borderStyle="single"
      borderRight
      paddingX={1}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">Services</Text>
      </Box>

      {services.map(service => (
        <Box key={service.name} marginBottom={1} flexDirection="column">
          <Box>
            <Box width={3}>
              {getStatusIcon(service.status)}
            </Box>

            <Box flexDirection="column" flexGrow={1}>
              <Text bold={selected === service.name} color={selected === service.name ? 'cyan' : undefined}>
                {service.displayName}
              </Text>

              {/* Show full URL */}
              {service.port && (
                <Text dimColor>
                  http://localhost:{service.port}
                  {service.uptime > 0 && ` • ${formatUptime(service.uptime)}`}
                </Text>
              )}

              {/* Show tunnel status */}
              {service.tunnelStatus === 'creating' && (
                <Box marginLeft={2}>
                  <Text color="yellow">⠋ Creating tunnel...</Text>
                </Box>
              )}
              {service.tunnelStatus === 'active' && service.tunnelUrl && (
                <Box marginLeft={2}>
                  <Text color="cyan">🌐 Tunnel URL (see header)</Text>
                </Box>
              )}
              {service.tunnelStatus === 'failed' && (
                <Box marginLeft={2}>
                  <Text color="red">✗ Tunnel failed (check cloudflared)</Text>
                </Box>
              )}

              {service.memory && (
                <Text dimColor>
                  Memory: {formatBytes(service.memory)}
                  {service.cpu && ` • CPU: ${service.cpu.toFixed(1)}%`}
                </Text>
              )}

              {service.error && !service.tunnelStatus && (
                <Text color="red">{service.error.substring(0, 40)}</Text>
              )}

              {/* Show projects under runner */}
              {service.name === 'runner' && projects && projects.length > 0 && (
                <Box flexDirection="column" marginLeft={2} marginTop={1}>
                  <Text dimColor>Projects ({projects.length}):</Text>
                  {projects.slice(0, 3).map((project, i) => (
                    <Box key={i}>
                      <Text dimColor>  ├─ </Text>
                      <Text>{project.name}</Text>
                      <Text dimColor> ({project.status})</Text>
                    </Box>
                  ))}
                  {projects.length > 3 && (
                    <Text dimColor>  └─ +{projects.length - 3} more</Text>
                  )}
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      ))}

      <Box marginTop={1} borderStyle="single" borderTop paddingTop={1}>
        <Text dimColor>
          {services.filter(s => s.status === 'running').length}/{services.length} running
        </Text>
      </Box>
    </Box>
  );
}
