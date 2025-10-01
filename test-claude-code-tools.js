/**
 * Test: Claude Code with Tool Calls
 *
 * Validates that we can capture tool usage data
 */

import { query } from '@anthropic-ai/claude-code';

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

async function* instrumentedQuery({ prompt, options }, instrumentationOptions = {}) {
  const span = new MockSpan(`query ${options?.model ?? 'sonnet'}`);

  console.log('🎯 Starting instrumented query with tool calls enabled');

  if (instrumentationOptions.recordInputs && typeof prompt === 'string') {
    span.setAttributes({
      'gen_ai.request.messages': JSON.stringify([{ role: 'user', content: prompt }])
    });
  }

  const originalQuery = query({ prompt, options });

  let assistantContent = '';
  let toolCalls = [];
  let finalUsage = null;

  try {
    for await (const message of originalQuery) {
      console.log(`📨 Message type: ${message.type}`);

      if (message.type === 'assistant') {
        console.log('📝 Assistant message:', JSON.stringify(message.message.content?.slice(0, 2), null, 2));

        if (instrumentationOptions.recordOutputs) {
          const content = message.message.content;
          if (Array.isArray(content)) {
            const textContent = content
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join('');
            assistantContent += textContent;

            const tools = content.filter(c => c.type === 'tool_use');
            if (tools.length > 0) {
              console.log(`🔧 Found ${tools.length} tool calls`);
              toolCalls.push(...tools);
            }
          }
        }
      }

      if (message.type === 'result') {
        finalUsage = message.usage;
      }

      yield message;
    }

    if (instrumentationOptions.recordOutputs && assistantContent) {
      span.setAttributes({
        'gen_ai.response.text': assistantContent.substring(0, 500)
      });
    }

    if (instrumentationOptions.recordOutputs && toolCalls.length > 0) {
      console.log('\n🔧 Tool calls captured:', toolCalls.map(t => ({
        name: t.name,
        id: t.id,
        inputKeys: Object.keys(t.input || {})
      })));

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

async function runTest() {
  console.log('🧪 Testing Tool Call Capture\n');

  try {
    const result = instrumentedQuery({
      prompt: 'What files are in the current directory? Use the Read tool to check.',
      options: {
        model: 'sonnet',
        maxTurns: 5,
        allowedTools: ['Read', 'Bash']
      }
    }, {
      recordInputs: true,
      recordOutputs: true
    });

    for await (const message of result) {
      // Consume messages
    }

    console.log('\n✅ Tool call test completed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

runTest();
