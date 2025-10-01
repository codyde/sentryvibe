/**
 * Integration Test: Claude Code with Sentry
 *
 * Tests the complete integration with actual Sentry SDK
 */

import * as Sentry from '@sentry/node';
import { query as originalQuery } from '@anthropic-ai/claude-code';
import { instrumentClaudeCodeQuery } from './sentry-claude-code-integration.js';

// Initialize Sentry
Sentry.init({
  dsn: process.env.SENTRY_DSN || 'https://examplePublicKey@o0.ingest.sentry.io/0',
  environment: 'test',
  tracesSampleRate: 1.0,
  sendDefaultPii: true, // Enable to record inputs/outputs by default
  debug: true, // Enable debug logging
  beforeSend(event) {
    // Log events locally instead of sending to Sentry in test
    console.log('\n🚀 Sentry Event Generated:');
    console.log('Event ID:', event.event_id);
    console.log('Spans:', event.spans?.length || 0);

    if (event.spans && event.spans.length > 0) {
      console.log('\n📊 Span Details:');
      event.spans.forEach((span, i) => {
        console.log(`\nSpan ${i + 1}:`);
        console.log('  Description:', span.description);
        console.log('  Op:', span.op);
        console.log('  Data:', JSON.stringify(span.data, null, 2));
      });
    }

    // Don't actually send to Sentry in test
    return null;
  },
});

// Wrap the query function with Sentry instrumentation
const query = instrumentClaudeCodeQuery(originalQuery, {
  recordInputs: true,
  recordOutputs: true,
});

async function runTest() {
  console.log('🧪 Testing Sentry Integration with Claude Code\n');
  console.log('═'.repeat(60));

  try {
    // Test 1: Simple query
    console.log('\n📝 Test 1: Simple Query');
    console.log('─'.repeat(60));

    await Sentry.startSpan(
      {
        name: 'test-simple-query',
        op: 'test',
      },
      async () => {
        const result = query({
          prompt: 'Calculate 15 * 23',
          options: {
            model: 'sonnet',
            maxTurns: 1,
          },
        });

        console.log('Query returned:', typeof result);
        console.log('Has .interrupt:', typeof result.interrupt === 'function');
        console.log('Has .setPermissionMode:', typeof result.setPermissionMode === 'function');

        let messageCount = 0;
        for await (const message of result) {
          messageCount++;
          if (message.type === 'assistant') {
            console.log('✅ Assistant response received');
          }
        }

        console.log(`✅ Processed ${messageCount} messages`);
      }
    );

    // Test 2: Query with tool calls
    console.log('\n\n📝 Test 2: Query with Tool Calls');
    console.log('─'.repeat(60));

    await Sentry.startSpan(
      {
        name: 'test-tool-calls',
        op: 'test',
      },
      async () => {
        const result = query({
          prompt: 'List all .js files in the current directory',
          options: {
            model: 'sonnet',
            maxTurns: 3,
            allowedTools: ['Glob', 'Read'],
          },
        });

        let toolCallCount = 0;
        for await (const message of result) {
          if (message.type === 'assistant') {
            const content = message.message.content;
            if (Array.isArray(content)) {
              const tools = content.filter(c => c.type === 'tool_use');
              if (tools.length > 0) {
                toolCallCount += tools.length;
                console.log(`🔧 Tool call detected: ${tools.map(t => t.name).join(', ')}`);
              }
            }
          }
        }

        console.log(`✅ Captured ${toolCallCount} tool calls`);
      }
    );

    // Test 3: Nested spans
    console.log('\n\n📝 Test 3: Nested Spans');
    console.log('─'.repeat(60));

    await Sentry.startSpan(
      {
        name: 'parent-operation',
        op: 'test',
      },
      async () => {
        console.log('🌳 Creating parent span');

        await Sentry.startSpan(
          {
            name: 'child-operation-1',
            op: 'test',
          },
          async () => {
            console.log('  └─ Child span 1');

            const result = query({
              prompt: 'What is today\'s date?',
              options: {
                model: 'sonnet',
                maxTurns: 1,
              },
            });

            for await (const message of result) {
              if (message.type === 'result') {
                console.log('     └─ Claude Code span (nested)');
              }
            }
          }
        );

        console.log('  └─ Child span 1 complete');
      }
    );

    console.log('\n═'.repeat(60));
    console.log('✅ All tests completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Flush Sentry events
    await Sentry.flush(2000);
  }
}

runTest();
