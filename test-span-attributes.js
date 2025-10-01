/**
 * Test: Verify span attributes are captured correctly
 */

import * as Sentry from '@sentry/node';
import { query as originalQuery } from '@anthropic-ai/claude-code';
import { instrumentClaudeCodeQuery } from './sentry-claude-code-integration.js';

Sentry.init({
  dsn: 'https://test@o0.ingest.sentry.io/0',
  tracesSampleRate: 1.0,
  sendDefaultPii: true,
  beforeSendTransaction(event) {
    console.log('\n📊 Transaction Event:');
    console.log('Transaction:', event.transaction);
    console.log('Spans:', event.spans?.length);

    if (event.spans) {
      event.spans.forEach((span, i) => {
        console.log(`\n📍 Span ${i + 1}: ${span.description}`);
        console.log('  Op:', span.op);

        if (span.data) {
          console.log('  Attributes:');
          Object.entries(span.data).forEach(([key, value]) => {
            const displayValue = typeof value === 'string' && value.length > 100
              ? value.substring(0, 100) + '...'
              : value;
            console.log(`    ${key}:`, displayValue);
          });
        }
      });
    }

    return null; // Don't send
  },
});

const query = instrumentClaudeCodeQuery(originalQuery, {
  recordInputs: true,
  recordOutputs: true,
});

async function test() {
  console.log('🔍 Testing Span Attribute Capture\n');

  await Sentry.startSpan({ name: 'test-attributes', op: 'test' }, async () => {
    const result = query({
      prompt: 'List JavaScript files in this directory',
      options: {
        model: 'sonnet',
        maxTurns: 2,
        allowedTools: ['Glob'],
      },
    });

    for await (const message of result) {
      // Consume
    }
  });

  await Sentry.flush(2000);
  console.log('\n✅ Test complete');
}

test();
