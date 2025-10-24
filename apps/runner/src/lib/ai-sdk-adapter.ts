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
  let currentMessageId: string | null = null;
  let currentTextContent = '';
  let toolInputBuffer: Map<string, { name: string; input: string }> = new Map();
  let toolResults: Map<string, any> = new Map();

  for await (const part of stream) {
    switch (part.type) {
      case 'response-metadata':
        // Start a new message
        currentMessageId = part.id || `msg-${Date.now()}`;
        break;

      case 'text-delta':
        // Accumulate text content
        const textChunk = part.delta ?? part.text;
        if (typeof textChunk === 'string') {
          currentTextContent += textChunk;

          // Yield incremental text update
          if (currentMessageId) {
            yield {
              type: 'assistant',
              message: {
                id: currentMessageId,
                content: [{ type: 'text', text: currentTextContent }],
              },
            };
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
        let toolInput = part.args;

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

        if (currentMessageId && toolName) {
          yield {
            type: 'assistant',
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
        }
        break;

      case 'tool-result':
        // Store tool result
        const resultId = part.toolCallId;
        toolResults.set(resultId, part.result ?? part.output);

        // Emit tool result as a user message
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

      case 'finish':
        // Final message with complete content
        if (currentMessageId) {
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
      case 'start':
      case 'start-step':
      case 'stream-start':
      case 'text-start':
      case 'text-end':
      case 'finish-step':
        break;

      default:
        // Log unknown event types for debugging
        if (process.env.DEBUG_BUILD === '1') {
          console.log('[ai-sdk-adapter] Unknown event type:', part.type);
        }
        break;
    }
  }
}
