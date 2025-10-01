/**
 * Test: Query.interrupt() method preservation
 *
 * Tests whether the attached .interrupt() method actually works
 */

import { query } from '@anthropic-ai/claude-code';

async function* instrumentedQuery({ prompt, options }) {
  console.log('🎯 Starting instrumented query');

  const originalQuery = query({ prompt, options });

  // Try to consume a few messages then interrupt
  let messageCount = 0;

  try {
    for await (const message of originalQuery) {
      messageCount++;
      console.log(`📨 Message ${messageCount}: ${message.type}`);

      yield message;

      // After receiving system message, try to interrupt
      if (messageCount === 1) {
        console.log('\n🛑 Attempting to call interrupt on originalQuery...');
        try {
          await originalQuery.interrupt();
          console.log('✅ Interrupt succeeded (originalQuery)');
        } catch (error) {
          console.log('❌ Interrupt failed:', error.message);
        }
      }
    }
  } finally {
    console.log(`\n📊 Consumed ${messageCount} messages total`);
  }
}

async function runTest() {
  console.log('🧪 Testing interrupt() method\n');

  try {
    const wrappedResult = instrumentedQuery({
      prompt: 'Count from 1 to 100 slowly',
      options: {
        model: 'sonnet',
        maxTurns: 10
      }
    });

    // Attach interrupt method from original
    const originalQuery = query({
      prompt: 'Count from 1 to 100 slowly',
      options: {
        model: 'sonnet',
        maxTurns: 10
      }
    });

    wrappedResult.interrupt = originalQuery.interrupt.bind(originalQuery);

    console.log('Has .interrupt:', typeof wrappedResult.interrupt === 'function');

    // Try calling interrupt on the wrapped result
    console.log('\n🛑 Testing interrupt on wrapped generator...');
    setTimeout(async () => {
      try {
        await wrappedResult.interrupt();
        console.log('✅ Interrupt on wrapped generator succeeded!');
      } catch (error) {
        console.log('⚠️  Interrupt on wrapped generator:', error.message);
      }
    }, 100);

    let count = 0;
    for await (const message of wrappedResult) {
      count++;
      if (count > 5) break; // Limit iteration
    }

    console.log('\n✅ Test completed');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

runTest();
