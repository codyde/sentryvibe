import { streamLog } from './file-logger.js';
import * as Sentry from '@sentry/node';

/**
 * Truncate strings for logging to prevent excessive output
 */
function truncate(str: string, maxLength: number = 200): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

/**
 * Truncate JSON objects for logging
 */
function truncateJSON(obj: unknown, maxLength: number = 200): string {
  const json = JSON.stringify(obj, null, 2);
  return truncate(json, maxLength);
}

/**
 * Adapter to transform AI SDK fullStream events into the format expected by our message transformer
 *
 * AI SDK stream events have types like:
 * - start, start-step, stream-start, response-metadata
 * - tool-input-start, tool-input-delta, tool-input-end
 * - tool-call, tool-error, tool-result
 * - text-start, text-delta, text-end
 * - finish, finish-step, error
 *
 * We need to transform these into the format the message transformer expects:
 * {
 *   type: 'assistant',
 *   message: {
 *     id: '...',
 *     content: [
 *       { type: 'text', text: '...' },
 *       { type: 'tool_use', id: '...', name: '...', input: {...} },
 *     ]
 *   }
 * }
 */

interface AISDKStreamPart {
  type: string;
  [key: string]: unknown;
}

interface AssistantMessage {
  type: 'assistant';
  message: {
    id: string;
    content: Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
      tool_use_id?: string;
      content?: string;
    }>;
  };
}

interface UserMessage {
  type: 'user';
  message: {
    id: string;
    content: Array<{
      type: string;
      tool_use_id?: string;
      content?: string;
      is_error?: boolean;
    }>;
  };
}

type TransformedMessage = AssistantMessage | UserMessage;

/**
 * Transforms AI SDK stream events into messages compatible with our message transformer
 */
export async function* transformAISDKStream(
  stream: AsyncIterable<AISDKStreamPart>
): AsyncGenerator<TransformedMessage, void, unknown> {
  const DEBUG = process.env.DEBUG_BUILD === '1';

  let currentMessageId: string = `msg-${Date.now()}`; // Always have a default ID
  let currentTextContent = '';
  const toolInputBuffer: Map<string, { name: string; input: string }> = new Map();
  const toolResults: Map<string, unknown> = new Map();
  let eventCount = 0;
  let yieldCount = 0;

  // Track active tool spans for proper duration measurement
  const activeToolSpans: Map<string, Sentry.Span> = new Map();

  // ALWAYS log start - write to stderr to bypass TUI console interceptor
  process.stderr.write('[runner] [ai-sdk-adapter] ✅ Starting stream transformation...\n');
  streamLog.info('━━━ STREAM TRANSFORMATION STARTED ━━━');

  for await (const part of stream) {
    eventCount++;

    // Log ALL events to file (first 50)
    if (eventCount <= 50) {
      streamLog.event(eventCount, part.type, part);
    }

    // DEBUG: Log first 20 events with full JSON to see what we're actually getting
    if (DEBUG && eventCount <= 20) {
      process.stderr.write(`[runner] [ai-sdk-adapter] Event #${eventCount}: type="${part.type}"\n`);
      process.stderr.write(`[runner] [ai-sdk-adapter]   Full JSON: ${truncateJSON(part, 500)}\n`);
    }

    if (DEBUG) console.log('[ai-sdk-adapter] Event:', part.type, part);

    // DEBUG: Log every 10 events to show progress
    if (DEBUG && eventCount % 10 === 0) {
      process.stderr.write(`[runner] [ai-sdk-adapter] Processed ${eventCount} events, yielded ${yieldCount} messages\n`);
    }

    switch (part.type) {
      case 'start':
      case 'start-step':
        // Update message ID if provided
        if (part.id) {
          currentMessageId = part.id as string;
          if (DEBUG) process.stderr.write(`[runner] [ai-sdk-adapter] Updated message ID: ${currentMessageId}\n`);
        }
        break;

      case 'text-start':
        // Capture message ID from text-start event
        if (part.id) {
          currentMessageId = part.id as string;
          if (DEBUG) process.stderr.write(`[runner] [ai-sdk-adapter] Message ID from text-start: ${currentMessageId}\n`);
        }
        break;

      case 'text-delta':
        // Just accumulate text content - DON'T yield for every token!
        // We'll only yield when there's a tool call or the message finishes
        const textChunk = part.delta ?? part.text ?? part.textDelta;
        if (typeof textChunk === 'string') {
          currentTextContent += textChunk;

          // Update message ID if provided in the event
          if (part.id) {
            currentMessageId = part.id as string;
          }
        }
        break;

      case 'tool-input-start':
        // Start buffering tool input
        toolInputBuffer.set(part.id as string, {
          name: part.toolName as string,
          input: '',
        });
        break;

      case 'tool-input-delta':
        // Accumulate tool input
        const buffer = toolInputBuffer.get(part.id as string) as { name: string; input: string } | undefined;
        if (buffer) {
          buffer.input += part.delta || '';
        }
        break;

      case 'tool-input-end':
      case 'tool-call':
        // Tool call is complete - emit it
        const toolCallId = part.toolCallId || part.id;
        const toolName = part.toolName as string;
        let toolInput = part.args || part.input;

        // If we have buffered input, parse it
        if (!toolInput && toolInputBuffer.has(toolCallId as string) && typeof toolCallId === 'string') {
          const buffered = toolInputBuffer.get(toolCallId) as { name: string; input?: string } | undefined;
          if (buffered?.input) {
            if (typeof buffered.input === 'string') {
              try {
                toolInput = JSON.parse(buffered.input) as unknown;
              } catch {
                toolInput = { raw: buffered.input };
              }
            }
          try {
            toolInput = JSON.parse(buffered.input) as unknown;
          } catch {
            toolInput = { raw: buffered.input };
          }
        }
          toolInputBuffer.delete(toolCallId as string);
        }

        if (toolName) {
          // First, yield any accumulated text as a separate message
          if (currentTextContent.trim().length > 0) {
            const textMessage = {
              type: 'assistant' as const,
              message: {
                id: currentMessageId,
                content: [{ type: 'text', text: currentTextContent }],
              },
            };
            yieldCount++;
            process.stderr.write(`[runner] [ai-sdk-adapter] 💬 Yielding text before tool: ${currentTextContent.length} chars\n`);
            yield textMessage;
            // Reset so it's not included in the tool message
            currentTextContent = '';
          }

          // Now yield the tool call as a separate message
          const toolMessage = {
            type: 'assistant' as const,
            message: {
              id: `${currentMessageId}-tool-${toolCallId}`,
              content: [
                {
                  type: 'tool_use',
                  id: toolCallId,
                  name: toolName,
                  input: toolInput || {},
                },
              ],
            },
          };
          yieldCount++;
          process.stderr.write(`[runner] [ai-sdk-adapter] 🔧 Tool call: ${toolName}\n`);
          process.stderr.write(`[runner] [ai-sdk-adapter]   Tool input: ${truncateJSON(toolInput)}\n`);

          // Log to file
          streamLog.yield('tool-call', { toolName, toolCallId, toolInput, message: toolMessage });

          yield toolMessage as TransformedMessage;
        }
        break;

      case 'tool-result':
        // Store tool result
        const resultId = part.toolCallId;
        const toolResult = part.result ?? part.output;
        toolResults.set(resultId as string, toolResult as unknown);

        // Emit tool result as a user message
        const resultMessage = {
          type: 'user' as const,
          message: {
            id: `result-${resultId}`,
            content: [
              {
                type: 'tool_result',
                tool_use_id: resultId,
                content: JSON.stringify(toolResult),
              },
            ],
          },
        };
        yieldCount++;
        process.stderr.write(`[runner] [ai-sdk-adapter] 📥 Tool result for: ${part.toolName || resultId}\n`);

        // Special handling for verbose tool results
        if (part.toolName === 'TodoWrite') {
          process.stderr.write(`[runner] [ai-sdk-adapter]   Result: ✓ Todos updated\n`);
        } else {
          process.stderr.write(`[runner] [ai-sdk-adapter]   Result: ${truncateJSON(toolResult)}\n`);
        }

        yield resultMessage as UserMessage;
        break;

      case 'tool-error':

        // Emit tool error as a user message
        const errorId = part.toolCallId || part.id;
        const errorMessage = {
          type: 'user' as const,
          message: {
            id: `error-${errorId}`,
            content: [
              {
                type: 'tool_result',
                tool_use_id: errorId,
                content: JSON.stringify({ error: part.error }),
                is_error: true,
              },
            ],
          },
        };
        yieldCount++;
        process.stderr.write(`[runner] [ai-sdk-adapter] ⚠️  Tool error: ${part.toolName || errorId}\n`);
        process.stderr.write(`[runner] [ai-sdk-adapter]   Error: ${truncate(JSON.stringify(part.error), 150)}\n`);
        yield errorMessage as UserMessage;
        break;

      case 'text-end':
        // Text block is complete - yield the accumulated text
        if (currentTextContent.trim().length > 0) {
          const message = {
            type: 'assistant' as const,
            message: {
              id: currentMessageId,
              content: [{ type: 'text', text: currentTextContent }],
            },
          };
          yieldCount++;
          process.stderr.write(`[runner] [ai-sdk-adapter] Yielding complete text block: ${currentTextContent.length} chars\n`);
          yield message as TransformedMessage;
          // Reset text content for next block
          currentTextContent = '';
        }
        break;

      case 'finish':
      case 'finish-step':
        // Final message - yield any remaining text
        if (currentTextContent.trim().length > 0) {
          yieldCount++;
          if (DEBUG) process.stderr.write(`[runner] [ai-sdk-adapter] Yielding final text: ${currentTextContent.length} chars\n`);
          yield {
            type: 'assistant' as const,
            message: {
              id: currentMessageId,
              content: [{ type: 'text', text: currentTextContent }],
            },
          };
        }
        break;

      case 'error':
        // Emit error
        const errorPayload = part.error ?? { message: 'Unknown Claude stream error' };
        const errorText =
          typeof errorPayload === 'object' && errorPayload !== null
            ? JSON.stringify(errorPayload)
            : String(errorPayload);

        const wrappedError = new Error(`Claude stream error: ${errorText}`);
        Object.assign(wrappedError, { cause: errorPayload });

        process.stderr.write(`[runner] [ai-sdk-adapter] ❌ Stream error: ${errorText}\n`);
        throw wrappedError;

      // Ignore other event types
      case 'stream-start':
      case 'response-metadata':
        break;

      default:
        // Log unknown event types for debugging
        if (process.env.DEBUG_BUILD === '1') {
          console.log('[ai-sdk-adapter] Unknown event type:', part.type);
        }
        break;
    }
  }

  // Clean up any orphaned tool spans (tool calls that never received results)
  if (activeToolSpans.size > 0) {
    process.stderr.write(`[runner] [ai-sdk-adapter] ⚠️  Cleaning up ${activeToolSpans.size} orphaned tool spans\n`);
    for (const [toolId, span] of activeToolSpans) {
      span.setStatus({ code: 2, message: 'Tool execution incomplete - no result received' });
      span.end();
      process.stderr.write(`[runner] [ai-sdk-adapter] 📊 Ended orphaned span: ${toolId}\n`);
    }
    activeToolSpans.clear();
  }

  // DEBUG: Log completion stats
  if (DEBUG) {
    process.stderr.write(`[runner] [ai-sdk-adapter] ✅ Stream complete - processed ${eventCount} events, yielded ${yieldCount} messages\n`);
  }

  streamLog.info('━━━ STREAM TRANSFORMATION COMPLETE ━━━');
  streamLog.info(`Total events: ${eventCount}`);
  streamLog.info(`Total yields: ${yieldCount}`);
}
