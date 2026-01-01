/**
 * TUI Event Processor
 * Connects runner events to the TUI state manager
 */

import { getTUIStateManager } from './state.js';
import type { RunnerEvent, BuildStreamEvent } from '@sentryvibe/agent-core/shared/runner/messages';

interface SSEEventData {
  type: string;
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  todos?: Array<{ content: string; status: string; id?: string }>;
  textDelta?: string;
  [key: string]: unknown;
}

/**
 * Parse SSE event data from build-stream format
 */
function parseSSEEventData(sseData: string): SSEEventData | null {
  const dataPrefix = 'data: ';
  const dataStart = sseData.indexOf(dataPrefix);
  if (dataStart === -1) return null;

  const jsonStart = dataStart + dataPrefix.length;
  const jsonStr = sseData.slice(jsonStart).trim().replace(/\n\n$/, '');

  if (!jsonStr.startsWith('{')) return null;

  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/**
 * Process a runner event and update the TUI state
 */
export function processRunnerEvent(event: RunnerEvent): void {
  const stateManager = getTUIStateManager();

  switch (event.type) {
    case 'build-stream': {
      const streamEvent = event as BuildStreamEvent;
      const eventData = parseSSEEventData(streamEvent.data);
      if (!eventData) return;

      processSSEEvent(eventData, stateManager);
      break;
    }

    case 'build-completed': {
      const payload = (event as { payload?: { summary?: string } }).payload;
      stateManager.updateSessionStatus('completed', undefined, payload?.summary);
      stateManager.addLog({
        service: 'build',
        level: 'info',
        message: 'Build completed successfully',
      });
      break;
    }

    case 'build-failed': {
      const errorEvent = event as { error?: string };
      stateManager.updateSessionStatus('failed', errorEvent.error);
      stateManager.addLog({
        service: 'build',
        level: 'error',
        message: `Build failed: ${errorEvent.error}`,
      });
      break;
    }

    case 'log-chunk': {
      const logEvent = event as { stream: string; data: string };
      stateManager.addLog({
        service: 'runner',
        level: logEvent.stream === 'stderr' ? 'error' : 'info',
        message: logEvent.data,
      });
      break;
    }

    case 'port-detected': {
      const portEvent = event as { port: number; framework?: string };
      stateManager.addLog({
        service: 'runner',
        level: 'info',
        message: `Dev server detected on port ${portEvent.port} (${portEvent.framework || 'unknown'})`,
      });
      break;
    }

    case 'tunnel-created': {
      const tunnelEvent = event as { tunnelUrl: string };
      stateManager.addLog({
        service: 'runner',
        level: 'info',
        message: `Tunnel created: ${tunnelEvent.tunnelUrl}`,
      });
      break;
    }

    case 'error': {
      const errorEvent = event as { error: string };
      stateManager.addLog({
        service: 'system',
        level: 'error',
        message: errorEvent.error,
      });
      break;
    }

    case 'runner-status': {
      stateManager.setConnected(true);
      break;
    }
  }
}

/**
 * Process SSE events from the build stream
 */
function processSSEEvent(eventData: SSEEventData, stateManager: ReturnType<typeof getTUIStateManager>): void {
  switch (eventData.type) {
    case 'start': {
      stateManager.updateSessionStatus('planning');
      stateManager.addLog({
        service: 'agent',
        level: 'info',
        message: 'Agent started processing',
      });
      break;
    }

    case 'tool-input-available': {
      const toolName = eventData.toolName;
      const toolCallId = eventData.toolCallId;
      const input = eventData.input;

      if (!toolName || !toolCallId) return;

      // Handle TodoWrite specially
      if (toolName === 'TodoWrite') {
        const todos = (input as { todos?: Array<{ content: string; status: string; id?: string }> })?.todos;
        if (todos && Array.isArray(todos)) {
          const activeTodoIndex = todos.findIndex(t => t.status === 'in_progress');
          stateManager.updateTodos(todos, activeTodoIndex);
        }
      }

      // Track all tool calls
      stateManager.startAction({
        id: toolCallId,
        name: toolName,
        input,
        todoIndex: stateManager.getState().activeTodoIndex,
      });
      break;
    }

    case 'tool-output-available': {
      const toolCallId = eventData.toolCallId;
      const output = eventData.output;

      if (!toolCallId) return;

      // Determine success/error from output
      const isError = output && typeof output === 'object' && 'error' in (output as object);
      stateManager.completeAction(toolCallId, output, isError ? 'error' : 'success');
      break;
    }

    case 'text-delta': {
      // Could display thinking/reasoning in the UI if desired
      // For now, just log it
      if (eventData.textDelta) {
        // Skip logging every text delta - too noisy
      }
      break;
    }

    case 'finish': {
      stateManager.addLog({
        service: 'agent',
        level: 'info',
        message: 'Agent finished processing',
      });
      break;
    }
  }
}

/**
 * Create an event handler that can be used with addRunnerEventSubscriber
 */
export function createTUIEventHandler(): (event: RunnerEvent) => void {
  return (event: RunnerEvent) => {
    try {
      processRunnerEvent(event);
    } catch (error) {
      console.error('[TUI] Error processing event:', error);
    }
  };
}
