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
  [key: string]: any;
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
      input?: any;
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
  let toolInputBuffer: Map<string, { name: string; input: string }> = new Map();
  let toolResults: Map<string, any> = new Map();
  let eventCount = 0;
  let yieldCount = 0;

  // ALWAYS log start - write to stderr to bypass TUI console interceptor
  process.stderr.write('[runner] [ai-sdk-adapter] ✅ Starting stream transformation...\n');

  for await (const part of stream) {
    eventCount++;

    // ALWAYS log first 20 events to see what we're actually getting
    if (eventCount <= 20) {
      const eventInfo = `[runner] [ai-sdk-adapter] Event #${eventCount}: type="${part.type}" ${JSON.stringify(part).substring(0, 200)}\n`;
      process.stderr.write(eventInfo);
    }

    if (DEBUG) console.log('[ai-sdk-adapter] Event:', part.type, part);

    // Log every 10 events to show progress - write to stderr
    if (eventCount % 10 === 0) {
      process.stderr.write(`[runner] [ai-sdk-adapter] Processed ${eventCount} events, yielded ${yieldCount} messages\n`);
    }

    switch (part.type) {
      case 'start':
      case 'start-step':
        // Update message ID if provided
        if (part.id) {
          currentMessageId = part.id;
          if (DEBUG) process.stderr.write(`[runner] [ai-sdk-adapter] Updated message ID: ${currentMessageId}\n`);
        }
        break;

      case 'text-start':
        // Capture message ID from text-start event
        if (part.id) {
          currentMessageId = part.id;
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
            currentMessageId = part.id;
          }
        }
        break;

      case 'tool-input-start':
        // Start buffering tool input
        toolInputBuffer.set(part.id, {
          name: part.toolName,
          input: '',
        });
        break;

      case 'tool-input-delta':
        // Accumulate tool input
        const buffer = toolInputBuffer.get(part.id);
        if (buffer) {
          buffer.input += part.delta || '';
        }
        break;

      case 'tool-input-end':
      case 'tool-call':
        // Tool call is complete - emit it
        const toolCallId = part.toolCallId || part.id;
        const toolName = part.toolName;
        let toolInput = part.args || part.input;

        // If we have buffered input, parse it
        if (!toolInput && toolInputBuffer.has(toolCallId)) {
          const buffered = toolInputBuffer.get(toolCallId)!;
          try {
            toolInput = JSON.parse(buffered.input);
          } catch {
            toolInput = { raw: buffered.input };
          }
          toolInputBuffer.delete(toolCallId);
        }

        if (toolName) {
          const message = {
            type: 'assistant' as const,
            message: {
              id: currentMessageId,
              content: [
                { type: 'text', text: currentTextContent },
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
          process.stderr.write(`[runner] [ai-sdk-adapter] 🔧 Tool call: ${toolName}\n`); // ALWAYS log tools
          if (DEBUG) process.stderr.write(`[runner] [ai-sdk-adapter] Full tool call: ${toolName} ${toolCallId}\n`);
          yield message;
        }
        break;

      case 'tool-result':
        // Store tool result
        const resultId = part.toolCallId;
        toolResults.set(resultId, part.result ?? part.output);

        // Emit tool result as a user message
        yieldCount++;
        yield {
          type: 'user',
          message: {
            id: `result-${resultId}`,
            content: [
              {
                type: 'tool_result',
                tool_use_id: resultId,
                content: JSON.stringify(part.result ?? part.output),
              },
            ],
          },
        };
        break;

      case 'tool-error':
        // Emit tool error as a user message
        const errorId = part.toolCallId || part.id;
        yieldCount++;
        yield {
          type: 'user',
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
        break;

      case 'text-end':
        // Text block is complete - yield the accumulated text
        if (currentTextContent.trim().length > 0) {
          yieldCount++;
          if (DEBUG) process.stderr.write(`[runner] [ai-sdk-adapter] Yielding complete text block: ${currentTextContent.length} chars\n`);
          yield {
            type: 'assistant',
            message: {
              id: currentMessageId,
              content: [{ type: 'text', text: currentTextContent }],
            },
          };
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
            type: 'assistant',
            message: {
              id: currentMessageId,
              content: [{ type: 'text', text: currentTextContent }],
            },
          };
        }
        break;

      case 'error':
        // Emit error
        console.error('[ai-sdk-adapter] Stream error:', part.error);
        break;

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

  // ALWAYS log completion - write to stderr
  process.stderr.write(`[runner] [ai-sdk-adapter] ✅ Stream complete - processed ${eventCount} events, yielded ${yieldCount} messages\n`);
}
