import { streamText, UIMessage, convertToModelMessages, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { DEFAULT_CLAUDE_MODEL_ID } from '@sentryvibe/agent-core/types/agent';
import type { ClaudeModelId } from '@sentryvibe/agent-core/types/agent';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  console.log('📨 Received request to /api/generate');
  
  const { messages, claudeModel }: { messages: UIMessage[]; claudeModel?: ClaudeModelId } = await req.json();
  console.log(`💬 Processing ${messages.length} message(s)`);

  const selectedClaudeModel: ClaudeModelId =
    claudeModel === 'claude-haiku-4-5' || claudeModel === 'claude-sonnet-4-5'
      ? claudeModel
      : DEFAULT_CLAUDE_MODEL_ID;

  const result = streamText({
    model: anthropic(selectedClaudeModel),
    messages: convertToModelMessages(messages),
    stopWhen: stepCountIs(5), // Allow up to 5 steps for multi-step tool usage
    tools: {
      bash: anthropic.tools.bash_20250124({}),
      web_search: anthropic.tools.webSearch_20250305({
        maxUses: 5,
        blockedDomains: [],
      }),
      text_editor: anthropic.tools.textEditor_20250124({}),
    },
    onStepFinish: ({ toolCalls, toolResults }) => {
      // Log tool activity to server console
      if (toolCalls && toolCalls.length > 0) {
        console.log('🔧 Tool Calls:', JSON.stringify(toolCalls, null, 2));
      }
      if (toolResults && toolResults.length > 0) {
        console.log('✅ Tool Results:', JSON.stringify(toolResults, null, 2));
      }
    },
  });

  console.log('✨ Streaming response back to client');
  return result.toUIMessageStreamResponse();
}
