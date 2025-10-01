/**
 * Sentry Integration for Claude Code SDK
 *
 * This module provides Sentry tracing instrumentation for the Claude Code SDK.
 * It follows the pattern used by Sentry's Anthropic AI integration.
 *
 * Usage:
 * ```javascript
 * import * as Sentry from '@sentry/node';
 * import { instrumentClaudeCodeQuery } from './sentry-claude-code-integration.js';
 * import { query as originalQuery } from '@anthropic-ai/claude-code';
 *
 * Sentry.init({
 *   dsn: 'your-dsn',
 *   sendDefaultPii: true, // Enable to record inputs/outputs by default
 * });
 *
 * // Wrap the query function
 * const query = instrumentClaudeCodeQuery(originalQuery, {
 *   recordInputs: true,
 *   recordOutputs: true
 * });
 *
 * // Use as normal
 * for await (const message of query({ prompt: 'Hello' })) {
 *   console.log(message);
 * }
 * ```
 *
 * @module sentry-claude-code-integration
 */

import { startSpanManual, getClient, getActiveSpan, startSpan, withActiveSpan } from '@sentry/core';

/**
 * OpenTelemetry semantic attributes for Claude Code
 * IMPORTANT: These must match exactly what Sentry's AI Monitoring dashboard expects
 */
const GEN_AI_ATTRIBUTES = {
  SYSTEM: 'gen_ai.system',
  OPERATION_NAME: 'gen_ai.operation.name',
  REQUEST_MODEL: 'gen_ai.request.model',
  REQUEST_MESSAGES: 'gen_ai.request.messages',
  RESPONSE_TEXT: 'gen_ai.response.text',
  RESPONSE_TOOL_CALLS: 'gen_ai.response.tool_calls',
  RESPONSE_ID: 'gen_ai.response.id',
  RESPONSE_MODEL: 'gen_ai.response.model',
  USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
  USAGE_TOTAL_TOKENS: 'gen_ai.usage.total_tokens',
};

const SENTRY_ORIGIN = 'auto.ai.claude-code';

/**
 * Sets token usage attributes on a span
 * Follows Sentry's pattern: total = input + output + cache_creation + cache_read
 */
function setTokenUsageAttributes(span, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens) {
  const attrs = {};

  if (typeof inputTokens === 'number') {
    attrs[GEN_AI_ATTRIBUTES.USAGE_INPUT_TOKENS] = inputTokens;
  }
  if (typeof outputTokens === 'number') {
    attrs[GEN_AI_ATTRIBUTES.USAGE_OUTPUT_TOKENS] = outputTokens;
  }

  // Calculate total tokens including ALL components (matching Sentry's Anthropic integration)
  const total = (inputTokens ?? 0) + (outputTokens ?? 0) + (cacheCreationTokens ?? 0) + (cacheReadTokens ?? 0);
  if (total > 0) {
    attrs[GEN_AI_ATTRIBUTES.USAGE_TOTAL_TOKENS] = total;
  }

  if (Object.keys(attrs).length > 0) {
    span.setAttributes(attrs);
  }
}

/**
 * Wraps a Claude Code query with Sentry instrumentation
 *
 * @param {Function} originalQueryFn - The original query function from @anthropic-ai/claude-code
 * @param {Object} options - Instrumentation options
 * @param {boolean} [options.recordInputs] - Whether to record input prompts (default: respects sendDefaultPii)
 * @param {boolean} [options.recordOutputs] - Whether to record output responses (default: respects sendDefaultPii)
 * @returns {Function} Instrumented query function
 */
export function instrumentClaudeCodeQuery(originalQueryFn, options = {}) {
  // Get default PII setting from Sentry client
  const client = getClient();
  const defaultPii = Boolean(client?.getOptions().sendDefaultPii);

  const recordInputs = options.recordInputs ?? defaultPii;
  const recordOutputs = options.recordOutputs ?? defaultPii;

  return function instrumentedQuery({ prompt, options: queryOptions, inputMessages }) {
    console.log('🔧 SENTRY: instrumentedQuery called');
    console.log('🔧 SENTRY: Prompt is string:', typeof prompt === 'string');
    console.log('🔧 SENTRY: Prompt is async iterable:',
      prompt && typeof prompt === 'object' && Symbol.asyncIterator in prompt);
    console.log('🔧 SENTRY: Input messages provided:', !!inputMessages);

    const model = queryOptions?.model ?? 'sonnet';

    // Create the original query instance (needed for method preservation)
    // IMPORTANT: Don't pass inputMessages to the SDK - it's only for Sentry
    const originalQuery = originalQueryFn({ prompt, options: queryOptions });

    // Create the instrumented generator
    const instrumentedGenerator = createInstrumentedGenerator(
      originalQuery,
      prompt,
      model,
      { recordInputs, recordOutputs, inputMessages }
    );

    // Preserve Query interface methods
    if (typeof originalQuery.interrupt === 'function') {
      instrumentedGenerator.interrupt = originalQuery.interrupt.bind(originalQuery);
    }
    if (typeof originalQuery.setPermissionMode === 'function') {
      instrumentedGenerator.setPermissionMode = originalQuery.setPermissionMode.bind(originalQuery);
    }

    return instrumentedGenerator;
  };
}

/**
 * Creates an instrumented async generator that wraps the original query
 *
 * @private
 */
function createInstrumentedGenerator(originalQuery, prompt, model, instrumentationOptions) {
  return startSpanManual(
    {
      name: `invoke_agent claude-code`,
      op: 'gen_ai.invoke_agent',
      attributes: {
        [GEN_AI_ATTRIBUTES.SYSTEM]: 'claude-code',
        [GEN_AI_ATTRIBUTES.REQUEST_MODEL]: model,
        [GEN_AI_ATTRIBUTES.OPERATION_NAME]: 'invoke_agent',
        'gen_ai.agent.name': 'claude-code',
        'sentry.origin': SENTRY_ORIGIN,
      },
    },
    async function* (span) {
      console.log('🔧 SENTRY: Span created:', span.spanContext().spanId);
      console.log('🔧 SENTRY: Span is recording:', span.isRecording());
      console.log('🔧 SENTRY: Creating instrumented generator');
      console.log('🔧 SENTRY: Prompt type:', typeof prompt);
      console.log('🔧 SENTRY: Is async iterable:', Symbol.asyncIterator in Object(prompt));
      console.log('🔧 SENTRY: Options:', instrumentationOptions);

      // Don't set input on invoke_agent span - that goes on the chat span

      // State accumulation
      let sessionId = null;
      let currentLLMSpan = null;
      let currentTurnContent = '';
      let currentTurnTools = [];
      let currentTurnId = null;
      let currentTurnModel = null;
      let inputMessagesCaptured = false;
      let finalResult = null;
      let previousLLMSpan = null; // Keep reference for tool spans
      let previousTurnTools = [];

      // Log parent span context
      console.log('🔧 SENTRY: Parent span ID:', span.spanContext().spanId);
      console.log('🔧 SENTRY: Parent span trace ID:', span.spanContext().traceId);

      try {
        let messageCount = 0;
        for await (const message of originalQuery) {
          messageCount++;
          console.log(`🔧 SENTRY: Message ${messageCount} type:`, message.type);

          // Extract session ID from system message
          if (message.type === 'system' && message.session_id) {
            sessionId = message.session_id;

            // Capture input messages from system message if available and not already captured
            if (!inputMessagesCaptured && instrumentationOptions.recordInputs && message.conversation_history) {
              console.log('🔧 SENTRY: Capturing input from conversation history');
              span.setAttributes({
                [GEN_AI_ATTRIBUTES.REQUEST_MESSAGES]: JSON.stringify(message.conversation_history),
              });
              inputMessagesCaptured = true;
            }
          }

          // Accumulate assistant messages for the current LLM turn
          if (message.type === 'assistant') {
            // If there's a previous LLM span still open (no tools were called), close it now
            if (previousLLMSpan) {
              previousLLMSpan.setStatus({ code: 1 }); // SPAN_STATUS_OK
              previousLLMSpan.end();
              console.log('🔧 SENTRY: Previous LLM turn span ended (no tool calls)');
              previousLLMSpan = null;
              previousTurnTools = [];
            }

            // If this is the first assistant message in this turn, create the span
            if (!currentLLMSpan) {
              console.log('🔧 SENTRY: Starting new LLM turn span');
              console.log('🔧 SENTRY: Active span before child creation:', getActiveSpan()?.spanContext().spanId);

              // Create child span within the parent span's context
              currentLLMSpan = withActiveSpan(span, () => {
                console.log('🔧 SENTRY: Active span inside withActiveSpan:', getActiveSpan()?.spanContext().spanId);
                return startSpanManual(
                  {
                    name: `chat ${model}`,
                    op: 'gen_ai.chat',
                    attributes: {
                      [GEN_AI_ATTRIBUTES.SYSTEM]: 'claude-code',
                      [GEN_AI_ATTRIBUTES.REQUEST_MODEL]: model,
                      [GEN_AI_ATTRIBUTES.OPERATION_NAME]: 'chat',
                      'sentry.origin': SENTRY_ORIGIN,
                    },
                  },
                  (childSpan) => {
                    console.log('🔧 SENTRY: Child span ID:', childSpan.spanContext().spanId);
                    console.log('🔧 SENTRY: Child span parent (from trace):', childSpan.spanContext().traceId);

                    // Set input messages on the chat span (system prompt + user messages)
                    if (instrumentationOptions.recordInputs && instrumentationOptions.inputMessages) {
                      console.log('🔧 SENTRY: Setting input messages on chat span');
                      childSpan.setAttributes({
                        [GEN_AI_ATTRIBUTES.REQUEST_MESSAGES]: JSON.stringify(instrumentationOptions.inputMessages),
                      });
                    }

                    return childSpan;
                  }
                );
              });

              currentTurnContent = '';
              currentTurnTools = [];
            }

            // Accumulate content from this assistant message
            const content = message.message.content;
            if (Array.isArray(content)) {
              // Accumulate text content
              const textContent = content
                .filter(c => c.type === 'text')
                .map(c => c.text)
                .join('');
              if (textContent) {
                currentTurnContent += textContent;
              }

              // Accumulate tool calls
              const tools = content.filter(c => c.type === 'tool_use');
              if (tools.length > 0) {
                currentTurnTools.push(...tools);
                console.log(`🔧 SENTRY: Accumulated ${tools.length} tool calls, total: ${currentTurnTools.length}`);
              }
            }

            // Store metadata (last one wins)
            if (message.message.id) {
              currentTurnId = message.message.id;
            }
            if (message.message.model) {
              currentTurnModel = message.message.model;
            }
          }

          // When we see a result message, finalize and end the current LLM span
          if (message.type === 'result') {
            // Capture final result for invoke_agent span
            if (message.result) {
              finalResult = message.result;
            }

            // Close any previous LLM span that's still open
            if (previousLLMSpan) {
              previousLLMSpan.setStatus({ code: 1 }); // SPAN_STATUS_OK
              previousLLMSpan.end();
              console.log('🔧 SENTRY: Previous LLM turn span ended (from result message)');
              previousLLMSpan = null;
              previousTurnTools = [];
            }

            if (currentLLMSpan) {
              console.log('🔧 SENTRY: Finalizing LLM turn span');
              console.log(`🔧 SENTRY: Text length: ${currentTurnContent.length}, Tools: ${currentTurnTools.length}`);

              // Set all accumulated response attributes
              if (instrumentationOptions.recordOutputs && currentTurnContent) {
                currentLLMSpan.setAttributes({
                  [GEN_AI_ATTRIBUTES.RESPONSE_TEXT]: currentTurnContent,
                });
              }

              if (instrumentationOptions.recordOutputs && currentTurnTools.length > 0) {
                console.log('🔧 SENTRY: Setting tool calls:', JSON.stringify(currentTurnTools));
                currentLLMSpan.setAttributes({
                  [GEN_AI_ATTRIBUTES.RESPONSE_TOOL_CALLS]: JSON.stringify(currentTurnTools),
                });
              }

              // Set metadata
              if (currentTurnId) {
                currentLLMSpan.setAttributes({
                  [GEN_AI_ATTRIBUTES.RESPONSE_ID]: currentTurnId,
                });
              }
              if (currentTurnModel) {
                currentLLMSpan.setAttributes({
                  [GEN_AI_ATTRIBUTES.RESPONSE_MODEL]: currentTurnModel,
                });
              }

              // Set token usage
              if (message.usage) {
                setTokenUsageAttributes(
                  currentLLMSpan,
                  message.usage.input_tokens,
                  message.usage.output_tokens,
                  message.usage.cache_creation_input_tokens,
                  message.usage.cache_read_input_tokens
                );
              }

              // End the span immediately (tool spans have already been created)
              currentLLMSpan.setStatus({ code: 1 }); // SPAN_STATUS_OK
              currentLLMSpan.end();
              console.log('🔧 SENTRY: LLM turn span ended');

              // Clear for next turn
              currentLLMSpan = null;
              currentTurnContent = '';
              currentTurnTools = [];
              currentTurnId = null;
              currentTurnModel = null;
            }
          }

          // Create execute_tool spans for tool_result messages
          if (message.type === 'user' && message.message?.content) {
            const toolResults = Array.isArray(message.message.content)
              ? message.message.content.filter(c => c.type === 'tool_result')
              : [];

            console.log(`🔧 SENTRY: Found ${toolResults.length} tool results`);
            console.log(`🔧 SENTRY: previousTurnTools:`, previousTurnTools.length);
            console.log(`🔧 SENTRY: previousLLMSpan exists:`, !!previousLLMSpan);

            for (const toolResult of toolResults) {
              // Find the matching tool call from current OR previous turn
              let matchingTool = currentTurnTools.find(t => t.id === toolResult.tool_use_id);
              let parentSpan = currentLLMSpan;

              if (!matchingTool && previousTurnTools.length > 0) {
                matchingTool = previousTurnTools.find(t => t.id === toolResult.tool_use_id);
                parentSpan = previousLLMSpan;
              }

              console.log(`🔧 SENTRY: Tool result ${toolResult.tool_use_id} - matching tool found:`, !!matchingTool);
              console.log(`🔧 SENTRY: Using parent span:`, parentSpan === currentLLMSpan ? 'current' : 'previous');

              if (matchingTool && parentSpan) {
                console.log(`🔧 SENTRY: Creating execute_tool span for ${matchingTool.name} as child of LLM span`);
                console.log(`🔧 SENTRY: Parent span ID:`, parentSpan.spanContext().spanId);
                console.log(`🔧 SENTRY: Parent span is recording:`, parentSpan.isRecording());
                console.log(`🔧 SENTRY: Parent span ended:`, !parentSpan.isRecording());

                // Create tool execution span as child of the LLM span using startSpanManual
                withActiveSpan(parentSpan, () => {
                  console.log(`🔧 SENTRY: Active span inside withActiveSpan:`, getActiveSpan()?.spanContext().spanId);

                  startSpan(
                    {
                      name: `execute_tool ${matchingTool.name}`,
                      op: 'gen_ai.execute_tool',
                      attributes: {
                        [GEN_AI_ATTRIBUTES.SYSTEM]: 'claude-code',
                        [GEN_AI_ATTRIBUTES.REQUEST_MODEL]: model,
                        [GEN_AI_ATTRIBUTES.OPERATION_NAME]: 'execute_tool',
                        'gen_ai.agent.name': 'claude-code',
                        'gen_ai.tool.name': matchingTool.name,
                        'sentry.origin': SENTRY_ORIGIN,
                      },
                    },
                    (toolSpan) => {
                      console.log(`🔧 SENTRY: Tool span ID:`, toolSpan.spanContext().spanId);

                      // Set tool input if recording inputs
                      if (instrumentationOptions.recordInputs && matchingTool.input) {
                        toolSpan.setAttributes({
                          'gen_ai.tool.input': JSON.stringify(matchingTool.input),
                        });
                      }

                      // Set tool output if recording outputs
                      if (instrumentationOptions.recordOutputs && toolResult.content) {
                        toolSpan.setAttributes({
                          'gen_ai.tool.output': typeof toolResult.content === 'string'
                            ? toolResult.content
                            : JSON.stringify(toolResult.content),
                        });
                      }

                      // Set error status if tool failed
                      if (toolResult.is_error) {
                        toolSpan.setStatus({ code: 2, message: 'Tool execution error' });
                      }
                    }
                  );
                });
              }
            }

            // Don't close the span yet - it will be closed when we see the result message
          }

          // Yield message to consumer
          yield message;
        }

        console.log(`🔧 SENTRY: Total messages processed: ${messageCount}`);

        // Set final result output on invoke_agent span
        if (instrumentationOptions.recordOutputs && finalResult) {
          console.log('🔧 SENTRY: Setting final result on invoke_agent span');
          span.setAttributes({
            [GEN_AI_ATTRIBUTES.RESPONSE_TEXT]: finalResult,
          });
        }

        // Set session ID on parent span if available
        if (sessionId) {
          console.log('🔧 SENTRY: Setting session ID on parent span');
          span.setAttributes({
            [GEN_AI_ATTRIBUTES.RESPONSE_ID]: sessionId,
          });
        }

        // Mark span as successful
        span.setStatus({ code: 1 }); // SPAN_STATUS_OK

      } catch (error) {
        console.error('🔧 SENTRY: Error in instrumentation:', error);
        console.error('🔧 SENTRY: Error stack:', error.stack);
        // Mark span as error
        span.setStatus({ code: 2, message: error.message }); // SPAN_STATUS_ERROR
        throw error;
      } finally {
        console.log('🔧 SENTRY: Ending span');
        // End span
        span.end();
      }
    }
  );
}

/**
 * Example integration with Sentry's integration pattern
 *
 * This could be contributed to @sentry/node in the future
 */
export function createClaudeCodeIntegration(options = {}) {
  return {
    name: 'ClaudeCode',
    setupOnce() {
      // This would use OpenTelemetry instrumentation in production
      // For now, users manually wrap the query function
      console.log('Claude Code integration loaded');
    },
    options,
  };
}

export default {
  instrumentClaudeCodeQuery,
  createClaudeCodeIntegration,
};
