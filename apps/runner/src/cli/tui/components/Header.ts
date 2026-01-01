/**
 * Header Component
 * Displays the SentryVibe banner and build status
 */

import type { BuildSession, BuildStatus } from '../types.js';
import { Colors } from '../types.js';

const STATUS_LABELS: Record<BuildStatus, string> = {
  idle: 'Idle',
  connecting: 'Connecting...',
  planning: 'Planning',
  building: 'Building',
  completed: 'Completed',
  failed: 'Failed',
};

const STATUS_COLORS: Record<BuildStatus, string> = {
  idle: Colors.textDim,
  connecting: Colors.warning,
  planning: Colors.info,
  building: Colors.primary,
  completed: Colors.success,
  failed: Colors.error,
};

export interface HeaderProps {
  session: BuildSession | null;
  isConnected: boolean;
}

export interface HeaderRenderData {
  logo: { text: string; color: string };
  connection: { text: string; color: string };
  project?: { name: string; status: string; statusColor: string };
  agent?: { text: string; color: string };
}

/**
 * Prepare header data for rendering
 * This can be used by any renderer (OpenTUI, ANSI, etc.)
 */
export function prepareHeaderData(props: HeaderProps): HeaderRenderData {
  const { session, isConnected } = props;

  const data: HeaderRenderData = {
    logo: { text: ' SentryVibe Runner', color: Colors.primary },
    connection: {
      text: isConnected ? ' ● Connected' : ' ○ Disconnected',
      color: isConnected ? Colors.success : Colors.error,
    },
  };

  if (session) {
    data.project = {
      name: session.projectName,
      status: STATUS_LABELS[session.status],
      statusColor: STATUS_COLORS[session.status],
    };

    if (session.agentId) {
      data.agent = {
        text: `Agent: ${session.agentId}`,
        color: Colors.textDim,
      };
    }
  }

  return data;
}

/**
 * Render header as ANSI string (fallback/testing)
 */
export function renderHeaderAnsi(props: HeaderProps, width: number = 80): string[] {
  const data = prepareHeaderData(props);
  const lines: string[] = [];

  // Title row
  const titleLeft = data.logo.text;
  const titleRight = data.connection.text;
  const padding = Math.max(0, width - titleLeft.length - titleRight.length);
  lines.push(titleLeft + ' '.repeat(padding) + titleRight);

  // Project row
  if (data.project) {
    lines.push(`Project: ${data.project.name} [${data.project.status}]`);
  }

  // Agent row
  if (data.agent) {
    lines.push(data.agent.text);
  }

  // Separator
  lines.push('─'.repeat(width));

  return lines;
}
