/**
 * Adapter to transform Codex SDK events into the unified format expected by message transformer
 *
 * Codex SDK uses a different event structure than AI SDK:
 * - thread.runStreamed().events yields ThreadEvent types
 * - We need to transform these to match our unified message format
 *
 * This allows the frontend to work with both Claude (AI SDK) and Codex (Codex SDK)
 * without knowing the difference.
 */

import { fileLog, streamLog } from './file-logger.js';

// Use Codex SDK's actual event type (it's a union of various event types)
// Since we can't import types from Codex SDK directly, we use a flexible type
type CodexThreadEvent = {
  type: string;
  item?: {
    type?: string;
    id?: string;
    text?: string;
    command?: string;
    aggregated_output?: string;
    exit_code?: number;
    status?: string;
    changes?: unknown[];
    server?: string;
    tool?: string;
    query?: string;
    message?: string;
    items?: unknown[];
    [key: string]: unknown;
  };
  thread_id?: string;
  usage?: unknown;
  message?: string;
  [key: string]: unknown;
}

interface TransformedMessage {
  type: 'assistant' | 'user';
  message: {
    id: string;
    content: Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: any;
      tool_use_id?: string;
      content?: string;
      is_error?: boolean;
    }>;
  };
}

/**
 * Extract item type from Codex event
 */
function getItemType(item: CodexThreadEvent['item']): string {
  if (!item) return '';
  if (typeof item.type === 'string') return item.type;
  return '';
}

/**
 * Extract tool call ID from item
 */
function getToolId(item: CodexThreadEvent['item']): string {
  if (!item) return `tool-${Date.now()}`;
  const candidates = ['id', 'tool_call_id', 'item_id'];
  for (const key of candidates) {
    const value = item[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return `tool-${Date.now()}`;
}

/**
 * Extract tool input from item
 */
function getToolInput(item: CodexThreadEvent['item']): any {
  if (!item) return {};
  const candidates = ['arguments', 'args', 'input'];
  for (const key of candidates) {
    const value = item[key];
    if (value !== undefined) return value;
  }
  return {};
}

/**
 * Extract tool output from item
 */
function getToolOutput(item: CodexThreadEvent['item']): any {
  if (!item) return null;
  const candidates = ['aggregated_output', 'output', 'result', 'content'];
  for (const key of candidates) {
    const value = item[key];
    if (value !== undefined) return value;
  }
  return null;
}

/**
 * Transform Codex SDK event stream to unified message format
 * 
 * IMPORTANT: This function must consume the entire event stream directly from
 * thread.runStreamed().events to preserve Sentry's async context for AI spans.
 * Do NOT wrap individual events in intermediate generators as this breaks the
 * AsyncLocalStorage context that Sentry uses for instrumentation.
 * 
 * ✅ Correct:   transformCodexStream(streamedTurn.events)
 * ❌ Incorrect: for (event of events) { transformCodexStream(singleEvent()) }
 * 
 * @param stream AsyncIterable of ThreadEvent from Codex SDK
 */
export async function* transformCodexStream(
  stream: AsyncIterable<any> // Use any to avoid type conflicts with Codex SDK's ThreadEvent union
): AsyncGenerator<TransformedMessage, void, unknown> {
  let currentMessageId = `codex-${Date.now()}`;
  let eventCount = 0;
  let yieldCount = 0;

  streamLog.info('━━━ CODEX STREAM TRANSFORMATION STARTED ━━━');

  for await (const event of stream) {
    eventCount++;

    // Log first 50 events
    if (eventCount <= 50) {
      streamLog.event(eventCount, event.type, event);
    }

    const itemType = getItemType(event.item);

    // Handle different Codex event types
    switch (event.type) {
      case 'item.started':
      case 'turn.started':
        // New turn/item started
        if (event.item) {
          currentMessageId = `codex-${Date.now()}-${getToolId(event.item)}`;
        }
        break;

      case 'item.completed': {
        // Tool execution completed
        if (!event.item) break;

        const itemType = event.item.type;
        const toolId = getToolId(event.item);

        // Handle different Codex item types
        if (itemType === 'command_execution') {
          // Command execution → Bash tool
          const toolMessage: TransformedMessage = {
            type: 'assistant',
            message: {
              id: `${currentMessageId}-tool-${toolId}`,
              content: [{
                type: 'tool_use',
                id: toolId,
                name: 'Bash',
                input: { command: event.item.command },
              }],
            },
          };

          yieldCount++;
          streamLog.yield('tool-call', { toolName: 'Bash', toolId, command: event.item.command });
          yield toolMessage;

          // Yield result
          const output = event.item.aggregated_output;
          if (output) {
            const resultMessage: TransformedMessage = {
              type: 'user',
              message: {
                id: `result-${toolId}`,
                content: [{
                  type: 'tool_result',
                  tool_use_id: toolId,
                  content: output,
                }],
              },
            };

            yieldCount++;
            streamLog.yield('tool-result', { toolId, output: output.substring(0, 100) });
            yield resultMessage;
          }
        } else if (itemType === 'file_change') {
          // File change → Write/Edit tool
          const changes = event.item.changes || [];
          const paths = changes.map((c: any) => c.path).join(', ');

          const toolMessage: TransformedMessage = {
            type: 'assistant',
            message: {
              id: `${currentMessageId}-tool-${toolId}`,
              content: [{
                type: 'tool_use',
                id: toolId,
                name: 'Write', // or 'Edit' - using Write for simplicity
                input: { paths: changes },
              }],
            },
          };

          yieldCount++;
          streamLog.yield('tool-call', { toolName: 'Write', toolId, paths });
          yield toolMessage;

          // Yield success result
          const resultMessage: TransformedMessage = {
            type: 'user',
            message: {
              id: `result-${toolId}`,
              content: [{
                type: 'tool_result',
                tool_use_id: toolId,
                content: `File changes applied: ${paths}`,
              }],
            },
          };

          yieldCount++;
          streamLog.yield('tool-result', { toolId, changes });
          yield resultMessage;
        } else if (itemType === 'agent_message' || itemType === 'reasoning') {
          // Agent message/reasoning → Text message
          let text = event.item.text as string;
          if (text && text.trim().length > 0) {
            // Strip markdown bold from reasoning (Codex outputs short bolded titles)
            // Convert "**Title**" to just "Title"
            text = text.replace(/^\*\*(.*?)\*\*$/g, '$1').trim();

            // Only yield if there's actual content (skip empty or very short reasoning)
            if (text.length > 5) {
              const textMessage: TransformedMessage = {
                type: 'assistant',
                message: {
                  id: currentMessageId,
                  content: [{
                    type: 'text',
                    text: text,
                  }],
                },
              };

              yieldCount++;
              streamLog.yield('text', { length: text.length });
              yield textMessage;
            }
          }
        }
        // TODO: Handle mcp_tool_call, web_search, todo_list, error item types

        break;
      }

      case 'turn.completed':
        // Turn completed - might have final response text
        if (event.finalResponse && typeof event.finalResponse === 'string') {
          const textMessage: TransformedMessage = {
            type: 'assistant',
            message: {
              id: currentMessageId,
              content: [{
                type: 'text',
                text: event.finalResponse,
              }],
            },
          };

          yieldCount++;
          streamLog.yield('text', { length: event.finalResponse.length });
          yield textMessage;
        }
        break;

      case 'error':
        // Error event
        fileLog.error('Codex stream error:', event.error);
        break;

      default:
        // Log unknown event types
        if (eventCount <= 20) {
          fileLog.debug(`Unknown Codex event type: ${event.type}`);
        }
        break;
    }
  }

  streamLog.info('━━━ CODEX STREAM TRANSFORMATION COMPLETE ━━━');
  streamLog.info(`Total events: ${eventCount}`);
  streamLog.info(`Total yields: ${yieldCount}`);
}
