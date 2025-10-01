/**
 * Prototype: Claude Code SDK Query Wrapping
 *
 * Tests whether we can successfully:
 * 1. Wrap the query() AsyncGenerator
 * 2. Preserve Query interface methods (interrupt, setPermissionMode)
 * 3. Capture data from the message stream
 */

import { query } from '@anthropic-ai/claude-code';

/**
 * Mock span for testing (mimics Sentry span interface)
 */
class MockSpan {
  constructor(name) {
    this.name = name;
    this.attributes = {};
    this.ended = false;
  }

  setAttributes(attrs) {
    Object.assign(this.attributes, attrs);
  }

  end() {
    this.ended = true;
    console.log('\n📊 Span ended. Captured attributes:', JSON.stringify(this.attributes, null, 2));
  }

  isRecording() {
    return !this.ended;
  }
}

/**
 * Wrap Claude Code query with instrumentation
 * This mimics what Sentry's instrumentClaudeCodeClient would do
 */
async function* instrumentedQuery({ prompt, options }, instrumentationOptions = {}) {
  const span = new MockSpan(`query ${options?.model ?? 'sonnet'}`);

  console.log('🎯 Starting instrumented query');
  console.log('📝 Prompt:', typeof prompt === 'string' ? prompt.substring(0, 100) : '<streaming>');

  // Record prompt if enabled
  if (instrumentationOptions.recordInputs && typeof prompt === 'string') {
    span.setAttributes({
      'gen_ai.request.messages': JSON.stringify([{ role: 'user', content: prompt }])
    });
  }

  // Create the original query
  const originalQuery = query({ prompt, options });

  // State accumulation
  let assistantContent = '';
  let toolCalls = [];
  let finalUsage = null;

  try {
    for await (const message of originalQuery) {
      console.log(`📨 Message type: ${message.type}`);

      // Extract data based on message type
      if (message.type === 'assistant') {
        if (instrumentationOptions.recordOutputs) {
          const content = message.message.content;
          if (Array.isArray(content)) {
            // Extract text
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

      if (message.type === 'result') {
        finalUsage = message.usage;
        console.log('💰 Token usage:', finalUsage);
      }

      // Yield message to consumer
      yield message;
    }

    // Set final attributes
    if (instrumentationOptions.recordOutputs && assistantContent) {
      span.setAttributes({
        'gen_ai.response.text': assistantContent.substring(0, 200) // Truncate for display
      });
    }

    if (instrumentationOptions.recordOutputs && toolCalls.length > 0) {
      span.setAttributes({
        'gen_ai.response.tool_calls': JSON.stringify(toolCalls)
      });
    }

    if (finalUsage) {
      span.setAttributes({
        'gen_ai.usage.input_tokens': finalUsage.input_tokens,
        'gen_ai.usage.output_tokens': finalUsage.output_tokens
      });
    }

  } finally {
    span.end();
  }
}

/**
 * Wrap query function while preserving Query interface methods
 */
function instrumentClaudeCodeQuery(originalQueryFn) {
  return function wrappedQuery({ prompt, options }) {
    console.log('🔧 Wrapping query...');

    const instrumentationOptions = {
      recordInputs: true,
      recordOutputs: true
    };

    // Create the instrumented generator
    const generator = instrumentedQuery({ prompt, options }, instrumentationOptions);

    // Attempt to preserve methods from original query
    // This is the key test: can we add methods to a generator?
    const originalQuery = originalQueryFn({ prompt, options });

    // Try to attach methods
    try {
      if (typeof originalQuery.interrupt === 'function') {
        generator.interrupt = originalQuery.interrupt.bind(originalQuery);
        console.log('✅ Successfully attached interrupt method');
      }

      if (typeof originalQuery.setPermissionMode === 'function') {
        generator.setPermissionMode = originalQuery.setPermissionMode.bind(originalQuery);
        console.log('✅ Successfully attached setPermissionMode method');
      }
    } catch (error) {
      console.error('❌ Failed to attach methods:', error.message);
    }

    return generator;
  };
}

/**
 * Run the test
 */
async function runTest() {
  console.log('🧪 Testing Claude Code Query Wrapping\n');

  // Wrap the query function
  const wrappedQuery = instrumentClaudeCodeQuery(query);

  try {
    // Test with a simple prompt
    const result = wrappedQuery({
      prompt: 'What is 2 + 2?',
      options: {
        model: 'sonnet',
        maxTurns: 1
      }
    });

    console.log('\n🔍 Testing method preservation:');
    console.log('Has .interrupt:', typeof result.interrupt === 'function');
    console.log('Has .setPermissionMode:', typeof result.setPermissionMode === 'function');
    console.log('Has .next:', typeof result.next === 'function');
    console.log('Has [Symbol.asyncIterator]:', typeof result[Symbol.asyncIterator] === 'function');

    console.log('\n📖 Consuming messages:\n');

    // Consume the generator
    for await (const message of result) {
      // Just iterate, logging is done in the wrapper
    }

    console.log('\n✅ Test completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
runTest();
