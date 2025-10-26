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
 * Extract TodoWrite calls from Codex text and convert to TODO_WRITE marker format
 *
 * Codex outputs: TodoWrite({ "todos": [...] })
 * We need: TODO_WRITE : {"todos": [...]}
 *
 * This allows the message transformer to recognize and process todo updates
 */
function extractAndConvertTodoWrite(text: string): string {
  if (!text) return text;

  // Match TodoWrite calls with various formatting:
  // TodoWrite({ "todos": [...] })
  // TodoWrite({\n  "todos": [...]\n})
  const todoWriteRegex = /TodoWrite\s*\(\s*(\{[\s\S]*?\})\s*\)/g;

  let match: RegExpExecArray | null;
  let result = text;
  const replacements: Array<{ original: string; replacement: string }> = [];

  while ((match = todoWriteRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const jsonText = match[1];

    try {
      // Validate that it's valid JSON
      const parsed = JSON.parse(jsonText);

      // Check if it has the expected todos structure
      if (parsed.todos && Array.isArray(parsed.todos)) {
        // Validate todos have required fields
        const validTodos = parsed.todos.filter((t: any) =>
          t && typeof t === 'object' && (t.content || t.activeForm)
        );

        if (validTodos.length > 0) {
          // Convert to TODO_WRITE marker format
          const todoWriteMarker = `TODO_WRITE : ${jsonText}`;
          replacements.push({ original: fullMatch, replacement: todoWriteMarker });

          streamLog.info(`[Codex Adapter] Extracted TodoWrite with ${validTodos.length} todos`);
          streamLog.info(`[Codex Adapter] First todo: ${JSON.stringify(validTodos[0])}`);
        } else {
          streamLog.warn('[Codex Adapter] TodoWrite has no valid todos, skipping');
        }
      }
    } catch (error) {
      // If JSON is invalid, leave it as-is
      streamLog.warn('[Codex Adapter] Failed to parse TodoWrite JSON:', error);
    }
  }

  // Apply all replacements
  for (const { original, replacement } of replacements) {
    result = result.replace(original, replacement);
  }

  // Also handle JSON-only format at the end of agent_message
  // Some Codex responses end with just: {"todos":[...]}
  const jsonOnlyRegex = /\n?(\{"todos":\s*\[[\s\S]*?\]\s*\})\s*$/;
  const jsonMatch = jsonOnlyRegex.exec(result);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.todos && Array.isArray(parsed.todos)) {
        const todoWriteMarker = `\nTODO_WRITE : ${jsonMatch[1]}`;
        result = result.replace(jsonOnlyRegex, todoWriteMarker);
        streamLog.info(`[Codex Adapter] Extracted JSON-only TodoWrite with ${parsed.todos.length} todos`);
      }
    } catch (error) {
      // Leave as-is if invalid
    }
  }

  return result;
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

  // Track in-progress tools to match started → completed events
  const inProgressTools = new Map<string, {
    type: string;
    command?: string;
    changes?: any[];
  }>();

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
      case 'item.started': {
        // Tool execution started - emit tool call
        if (!event.item) break;

        const toolId = getToolId(event.item);
        const itemType = event.item.type;

        if (itemType === 'command_execution') {
          // Store tool info for matching with completion
          inProgressTools.set(toolId, {
            type: 'command_execution',
            command: event.item.command,
          });

          // Emit tool call immediately
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
          streamLog.yield('tool-call-start', { toolName: 'Bash', toolId, command: event.item.command });
          yield toolMessage;
        } else if (itemType === 'file_change') {
          // Store file change info
          const changes = event.item.changes || [];
          inProgressTools.set(toolId, {
            type: 'file_change',
            changes,
          });

          // Emit tool call immediately
          const paths = changes.map((c: any) => c.path).join(', ');
          const toolMessage: TransformedMessage = {
            type: 'assistant',
            message: {
              id: `${currentMessageId}-tool-${toolId}`,
              content: [{
                type: 'tool_use',
                id: toolId,
                name: 'Write',
                input: { paths: changes },
              }],
            },
          };

          yieldCount++;
          streamLog.yield('tool-call-start', { toolName: 'Write', toolId, paths });
          yield toolMessage;
        }

        // Update message ID
        if (event.item) {
          currentMessageId = `codex-${Date.now()}-${toolId}`;
        }
        break;
      }

      case 'turn.started':
        // New turn started
        if (event.item) {
          currentMessageId = `codex-${Date.now()}-${getToolId(event.item)}`;
        }
        break;

      case 'item.completed': {
        // Tool execution completed - emit tool result only
        if (!event.item) break;

        const itemType = event.item.type;
        const toolId = getToolId(event.item);

        // Handle different Codex item types
        if (itemType === 'command_execution') {
          // Command execution completed - emit result
          const toolInfo = inProgressTools.get(toolId);

          // If we didn't track the start (shouldn't happen), emit the tool call now
          if (!toolInfo) {
            streamLog.warn(`[Codex Adapter] Tool ${toolId} completed without start event, emitting both`);
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
            yield toolMessage;
          }

          // Emit result
          const output = event.item.aggregated_output || '';
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

          // Clean up tracking
          inProgressTools.delete(toolId);
        } else if (itemType === 'file_change') {
          // File change completed - emit result
          const toolInfo = inProgressTools.get(toolId);
          const changes = event.item.changes || [];
          const paths = changes.map((c: any) => c.path).join(', ');

          // If we didn't track the start (shouldn't happen), emit the tool call now
          if (!toolInfo) {
            streamLog.warn(`[Codex Adapter] Tool ${toolId} completed without start event, emitting both`);
            const toolMessage: TransformedMessage = {
              type: 'assistant',
              message: {
                id: `${currentMessageId}-tool-${toolId}`,
                content: [{
                  type: 'tool_use',
                  id: toolId,
                  name: 'Write',
                  input: { paths: changes },
                }],
              },
            };
            yieldCount++;
            yield toolMessage;
          }

          // Emit result
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

          // Clean up tracking
          inProgressTools.delete(toolId);
        } else if (itemType === 'agent_message' || itemType === 'reasoning') {
          // Agent message/reasoning → Text message
          let text = event.item.text as string;
          if (text && text.trim().length > 0) {
            // Strip markdown bold from reasoning (Codex outputs short bolded titles)
            // Convert "**Title**" to just "Title"
            text = text.replace(/^\*\*(.*?)\*\*$/g, '$1').trim();

            // Extract TodoWrite calls and convert to TODO_WRITE markers
            // Codex outputs: TodoWrite({ "todos": [...] })
            // We need: TODO_WRITE : {"todos": [...]}
            text = extractAndConvertTodoWrite(text);

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
        } else if (itemType === 'todo_list') {
          // Handle explicit todo_list items from Codex
          // These are structured todo updates that should be converted to TodoWrite format
          if (event.item.items && Array.isArray(event.item.items)) {
            const todos = event.item.items.map((item: any) => {
              // Normalize status values to match expected format
              let status = item.status || 'pending';
              // Handle variations: 'in-progress', 'in_progress', 'inprogress'
              if (status.toLowerCase().replace(/[-_\s]/g, '') === 'inprogress') {
                status = 'in_progress';
              }

              return {
                content: item.content || item.description || '',
                activeForm: item.activeForm || item.content || item.description || '',
                status: status as 'pending' | 'in_progress' | 'completed',
              };
            });

            // Validate at least some todos have content
            const validTodos = todos.filter((t: { content: string; activeForm: string; status: string }) =>
              t.content && t.content.length > 0
            );
            if (validTodos.length === 0) {
              streamLog.warn('[Codex Adapter] todo_list has no valid todos, skipping');
              break;
            }

            // Convert to TODO_WRITE marker format
            const todoWriteMarker = `TODO_WRITE : ${JSON.stringify({ todos: validTodos })}`;
            const textMessage: TransformedMessage = {
              type: 'assistant',
              message: {
                id: currentMessageId,
                content: [{
                  type: 'text',
                  text: todoWriteMarker,
                }],
              },
            };

            yieldCount++;
            streamLog.yield('todo-list', { count: validTodos.length });
            streamLog.info(`[Codex Adapter] Converted todo_list to TodoWrite with ${validTodos.length} todos`);
            yield textMessage;
          }
        }
        // TODO: Handle mcp_tool_call, web_search, error item types

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
