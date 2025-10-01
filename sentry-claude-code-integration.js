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

import { startSpanManual, getClient } from '@sentry/core';

/**
 * OpenTelemetry semantic attributes for Claude Code
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
  USAGE_CACHE_CREATION_INPUT_TOKENS: 'gen_ai.usage.cache_creation_input_tokens',
  USAGE_CACHE_READ_INPUT_TOKENS: 'gen_ai.usage.cache_read_input_tokens',
};

const SENTRY_ORIGIN = 'auto.ai.claude-code';

/**
 * Sets token usage attributes on a span
 */
function setTokenUsageAttributes(span, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens) {
  const attrs = {};

  if (typeof inputTokens === 'number') {
    attrs[GEN_AI_ATTRIBUTES.USAGE_INPUT_TOKENS] = inputTokens;
  }
  if (typeof outputTokens === 'number') {
    attrs[GEN_AI_ATTRIBUTES.USAGE_OUTPUT_TOKENS] = outputTokens;
  }
  if (typeof inputTokens === 'number' && typeof outputTokens === 'number') {
    attrs[GEN_AI_ATTRIBUTES.USAGE_TOTAL_TOKENS] = inputTokens + outputTokens;
  }
  if (typeof cacheCreationTokens === 'number') {
    attrs[GEN_AI_ATTRIBUTES.USAGE_CACHE_CREATION_INPUT_TOKENS] = cacheCreationTokens;
  }
  if (typeof cacheReadTokens === 'number') {
    attrs[GEN_AI_ATTRIBUTES.USAGE_CACHE_READ_INPUT_TOKENS] = cacheReadTokens;
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

  return function instrumentedQuery({ prompt, options: queryOptions }) {
    const model = queryOptions?.model ?? 'sonnet';

    // Create the original query instance (needed for method preservation)
    const originalQuery = originalQueryFn({ prompt, options: queryOptions });

    // Create the instrumented generator
    const instrumentedGenerator = createInstrumentedGenerator(
      originalQuery,
      prompt,
      model,
      { recordInputs, recordOutputs }
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
      name: `query ${model}`,
      op: 'gen_ai.invoke_agent',
      attributes: {
        [GEN_AI_ATTRIBUTES.SYSTEM]: 'claude-code',
        [GEN_AI_ATTRIBUTES.REQUEST_MODEL]: model,
        [GEN_AI_ATTRIBUTES.OPERATION_NAME]: 'query',
        'sentry.origin': SENTRY_ORIGIN,
      },
    },
    async function* (span) {
      // Record prompt if enabled
      if (instrumentationOptions.recordInputs && typeof prompt === 'string') {
        span.setAttributes({
          [GEN_AI_ATTRIBUTES.REQUEST_MESSAGES]: JSON.stringify([
            { role: 'user', content: prompt }
          ]),
        });
      }

      // State accumulation
      let assistantContent = '';
      let toolCalls = [];
      let sessionId = null;
      let finalUsage = null;

      try {
        for await (const message of originalQuery) {
          // Extract session ID from system message
          if (message.type === 'system' && message.session_id) {
            sessionId = message.session_id;
          }

          // Extract data from assistant messages
          if (message.type === 'assistant') {
            if (instrumentationOptions.recordOutputs) {
              const content = message.message.content;
              if (Array.isArray(content)) {
                // Extract text content
                const textContent = content
                  .filter(c => c.type === 'text')
                  .map(c => c.text)
                  .join('');
                assistantContent += textContent;

                // Extract tool calls
                const tools = content.filter(c => c.type === 'tool_use');
                toolCalls.push(...tools);
              }
            }
          }

          // Extract final usage data
          if (message.type === 'result') {
            finalUsage = message.usage;
          }

          // Yield message to consumer
          yield message;
        }

        // Set final attributes after stream completes
        if (instrumentationOptions.recordOutputs && assistantContent) {
          span.setAttributes({
            [GEN_AI_ATTRIBUTES.RESPONSE_TEXT]: assistantContent,
          });
        }

        if (instrumentationOptions.recordOutputs && toolCalls.length > 0) {
          span.setAttributes({
            [GEN_AI_ATTRIBUTES.RESPONSE_TOOL_CALLS]: JSON.stringify(toolCalls),
          });
        }

        if (sessionId) {
          span.setAttributes({
            [GEN_AI_ATTRIBUTES.RESPONSE_ID]: sessionId,
          });
        }

        if (finalUsage) {
          setTokenUsageAttributes(
            span,
            finalUsage.input_tokens,
            finalUsage.output_tokens,
            finalUsage.cache_creation_input_tokens,
            finalUsage.cache_read_input_tokens
          );
        }

        // Mark span as successful
        span.setStatus({ code: 1 }); // SPAN_STATUS_OK

      } catch (error) {
        // Mark span as error
        span.setStatus({ code: 2, message: error.message }); // SPAN_STATUS_ERROR
        throw error;
      } finally {
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
