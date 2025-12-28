import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_CLAUDE_MODEL_ID } from "@sentryvibe/agent-core/types/agent";
import type { ClaudeModelId } from "@sentryvibe/agent-core/types/agent";
import * as Sentry from "@sentry/nextjs";

// Create Anthropic client
const anthropic = new Anthropic();

// Map model IDs to Anthropic API model names  
const MODEL_MAP: Record<string, string> = {
  'claude-haiku-4-5': 'claude-sonnet-4-20250514',
  'claude-sonnet-4-5': 'claude-sonnet-4-20250514', 
  'claude-opus-4-5': 'claude-sonnet-4-20250514',
};

function resolveModelName(modelId: string): string {
  return MODEL_MAP[modelId] || 'claude-sonnet-4-20250514';
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ProjectContext {
  id: string;
  name: string;
  slug: string;
  path: string;
  projectType: string | null;
  description: string | null;
}

export async function POST(req: Request) {
  const {
    messages,
    claudeModel,
    projectContext,
  }: { 
    messages: ChatMessage[]; 
    claudeModel?: ClaudeModelId;
    projectContext?: ProjectContext;
  } = await req.json();
  
  Sentry.logger.info(
    Sentry.logger.fmt`Processing chat messages ${{
      messageCount: messages.length,
      claudeModel,
      hasProjectContext: !!projectContext,
    }}`
  );

  const selectedClaudeModel: ClaudeModelId =
    claudeModel === "claude-haiku-4-5" || claudeModel === "claude-sonnet-4-5" || claudeModel === "claude-opus-4-5"
      ? claudeModel
      : DEFAULT_CLAUDE_MODEL_ID;

  // Build system prompt based on whether we have project context
  let systemPrompt = "";
  if (projectContext) {
    systemPrompt = `You are a helpful coding assistant helping the user iterate on their existing project.

PROJECT CONTEXT:
- Name: ${projectContext.name}
- Type: ${projectContext.projectType || "Unknown"}
- Location: ${projectContext.path}
${projectContext.description ? `- Description: ${projectContext.description}` : ""}

IMPORTANT INSTRUCTIONS:
- This is a CHAT conversation about an EXISTING project
- The user is asking questions or requesting small iterations/clarifications
- Focus on understanding the current state and making precise, helpful suggestions
- If the user wants major architectural changes, suggest they use the "Build" tab instead
- Keep responses focused and conversational - this is a chat, not a full build process

You can help with:
- Answering questions about the code
- Explaining how things work
- Suggesting improvements and best practices
- Helping debug issues
- Providing code examples

Remember: This is an iterative chat about an existing project, not a full build session.`;
  } else {
    systemPrompt = `You are a helpful coding assistant. You can answer questions and help with code, but for creating new projects, the user should use the main interface.`;
  }

  // Convert messages to Anthropic format
  const anthropicMessages: Anthropic.MessageParam[] = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));

  // Create streaming response
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const messageStream = await anthropic.messages.stream({
          model: resolveModelName(selectedClaudeModel),
          max_tokens: 4096,
          system: systemPrompt,
          messages: anthropicMessages,
        });

        for await (const event of messageStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            // Format as SSE data event compatible with AI SDK UI
            const data = JSON.stringify({
              type: 'text-delta',
              textDelta: event.delta.text,
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
        }

        // Send done event
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();

        Sentry.logger.info(Sentry.logger.fmt`Chat stream completed`);
      } catch (error) {
        Sentry.logger.error(
          Sentry.logger.fmt`Chat stream error ${{
            error: error instanceof Error ? error.message : String(error),
          }}`
        );
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
