import { streamText, UIMessage, convertToModelMessages } from 'ai';
import { createClaudeCode } from 'ai-sdk-provider-claude-code';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// Create Claude Code provider with built-in bash and text editor tools
// It automatically picks up ANTHROPIC_API_KEY from environment
const claudeCode = createClaudeCode({
  defaultSettings: {
    permissionMode: 'bypassPermissions', // Options: 'default' | 'auto' | 'bypassPermissions'
  },
});

export async function POST(req: Request) {
  console.log('📨 Received request to /api/chat');
  
  const { messages }: { messages: UIMessage[] } = await req.json();
  console.log(`💬 Processing ${messages.length} message(s)`);

  const result = streamText({
    model: claudeCode('claude-sonnet-4-5'),
    experimental_telemetry:{
      isEnabled: true,
      functionId: 'Code'
    },
    messages: convertToModelMessages(messages),
    async onStepFinish({ text, toolCalls, toolResults, finishReason, usage, response }) {
      console.log('📊 Step finished:', {
        finishReason,
        usage,
        hasText: !!text,
        toolCallsCount: toolCalls?.length || 0,
        toolResultsCount: toolResults?.length || 0,
        responseType: response ? 'has response' : 'no response',
      });
      
      // Log tool activity to server console
      if (toolCalls && toolCalls.length > 0) {
        console.log('🔧 Tool Calls:', JSON.stringify(toolCalls, null, 2));
      }
      if (toolResults && toolResults.length > 0) {
        console.log('✅ Tool Results:', JSON.stringify(toolResults, null, 2));
      }
      if (text) {
        console.log('📝 Text generated:', text.slice(0, 200));
      }
      
      // Log the full response to see what Anthropic is returning
      if (response?.messages) {
        console.log('🔍 Response messages:', JSON.stringify(response.messages, null, 2));
      }
    },
  });

  console.log('✨ Streaming response back to client');
  return result.toUIMessageStreamResponse();
}
