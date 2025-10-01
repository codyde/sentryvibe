import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from 'ai';
import type { MessageParam } from '@anthropic-ai/sdk/resources';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// Convert AI SDK UIMessage to Anthropic Messages API format
function convertUIMessageToAnthropicFormat(msg: UIMessage): MessageParam {
  const content: any[] = [];

  for (const part of msg.parts) {
    if (part.type === 'text' && 'text' in part && part.text) {
      content.push({
        type: 'text',
        text: part.text,
      });
    } else if (part.type?.startsWith('tool-')) {
      // Extract tool name
      const toolName = part.type.replace('tool-', '');

      // For tool input (assistant's tool call) - check if it has input
      if ('input' in part && part.input) {
        content.push({
          type: 'tool_use',
          id: 'toolCallId' in part ? (part as any).toolCallId : `tool_${Date.now()}`,
          name: 'toolName' in part ? (part as any).toolName : toolName,
          input: part.input,
        });
      }

      // For tool results (user's tool result) - check if it has output
      if ('output' in part && part.output) {
        content.push({
          type: 'tool_result',
          tool_use_id: 'toolCallId' in part ? (part as any).toolCallId : `tool_${Date.now()}`,
          content: typeof part.output === 'string' ? part.output : JSON.stringify(part.output),
        });
      }
    }
  }

  return {
    role: msg.role as 'user' | 'assistant',
    content: content.length > 0 ? content : 'Continue',
  };
}

// Create async iterable of SDK messages for conversation history
async function* createConversationHistory(messages: UIMessage[]): AsyncGenerator<SDKUserMessage> {
  // Yield all messages except the last one (which will be the new prompt)
  for (const msg of messages.slice(0, -1)) {
    yield {
      type: 'user' as const,
      message: convertUIMessageToAnthropicFormat(msg),
      parent_tool_use_id: null,
      session_id: 'web-session',
    };
  }

  // Yield the final user message
  const lastMessage = messages[messages.length - 1];
  yield {
    type: 'user' as const,
    message: convertUIMessageToAnthropicFormat(lastMessage),
    parent_tool_use_id: null,
    session_id: 'web-session',
  };
}

// Process Agent SDK messages and write to UI Message Stream
async function writeAgentMessagesToStream(
  agentStream: AsyncGenerator<any>,
  writer: any
) {
  let currentMessageId: string | null = null;
  let messageStarted = false;

  for await (const message of agentStream) {
    console.log('📦 Agent Message:', JSON.stringify(message, null, 2));

    // Skip system init message
    if (message.type === 'system' && message.subtype === 'init') {
      continue;
    }

    // Handle assistant messages
    if (message.type === 'assistant') {
      const content = message.message?.content;
      const assistantMessageId = message.message?.id || message.uuid;

      // Start new message if this is a different message ID
      if (assistantMessageId !== currentMessageId) {
        // Finish previous message if one was open
        if (messageStarted && currentMessageId) {
          writer.write({
            type: 'finish',
          });
        }

        // Start new message
        currentMessageId = assistantMessageId;
        messageStarted = true;
        writer.write({
          type: 'start',
          messageId: assistantMessageId,
        });
      }

      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            // Generate unique text block ID
            const textBlockId = `${assistantMessageId}-text-${Date.now()}`;

            writer.write({
              type: 'text-start',
              id: textBlockId,
            });

            writer.write({
              type: 'text-delta',
              id: textBlockId,
              delta: block.text,
            });

            writer.write({
              type: 'text-end',
              id: textBlockId,
            });
          } else if (block.type === 'tool_use') {
            // Send tool input with available state
            writer.write({
              type: 'tool-input-available',
              toolCallId: block.id,
              toolName: block.name,
              input: block.input,
            });
          }
        }
      }
    }
    // Handle user messages (tool results)
    else if (message.type === 'user' && message.message?.content) {
      const content = message.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result') {
            writer.write({
              type: 'tool-output-available',
              toolCallId: block.tool_use_id,
              output: block.content,
            });
          }
        }
      }
    }
    // Handle final result
    else if (message.type === 'result') {
      // This is the final message from the Agent SDK
      if (messageStarted && currentMessageId) {
        writer.write({
          type: 'finish',
        });
        messageStarted = false;
      }
    }
    // Handle errors
    else if (message.type === 'error') {
      console.error('❌ Agent Error:', message.error);
      writer.write({
        type: 'error',
        errorText: typeof message.error === 'string' ? message.error : JSON.stringify(message.error),
      });
    }
  }

  // Finish the message if still open
  if (messageStarted && currentMessageId) {
    writer.write({
      type: 'finish',
    });
  }
}

export async function POST(req: Request) {
  console.log('📨 Received request to /api/claude-agent');

  const { messages }: { messages: UIMessage[] } = await req.json();
  console.log(`💬 Processing ${messages.length} message(s)`);

  try {
    // Create UI Message Stream using AI SDK
    const stream = createUIMessageStream({
      async execute({ writer }) {
        // Create Claude Agent SDK query with proper configuration
        const agentStream = query({
          // Pass conversation history as async iterable of SDK messages
          prompt: createConversationHistory(messages),
          options: {
            model: 'claude-sonnet-4-5',
            cwd: '/Users/codydearkland/sentryvibe/projects',
            permissionMode: 'bypassPermissions',
            maxTurns: 10,
            systemPrompt: `You are a helpful coding assistant specialized in building JavaScript applications and prototyping ideas.

CRITICAL WORKFLOW - FOLLOW THIS EXACT SEQUENCE:

Projects should ALWAYS be created in the <current-project-root>/projects/ directory. Do NOT EVER create projects outside of this directory under any circumstances. When creating a new JavaScript project, you MUST:

1. ALWAYS use CLI tools to scaffold projects - NEVER manually create project files:
   - For Next.js: npx create-next-app@latest <project-name>
   - For Vite + React: npm create vite@latest <project-name> -- --template react-ts
   - For other frameworks: use their official CLI scaffolding tools

2. After completion, test the build by attempting to start the application and then trying to open it, and read your terminal line to see if there are any errors. If there are, fix them.

3. After completing ALL tasks, ALWAYS offer to install Sentry:
   - Ask if the user wants Sentry installed
   - If yes, consult Sentry documentation for the correct installation method
   - Follow Sentry's official setup guide for the specific framework

NEVER manually create project files when a CLI tool exists.
ALWAYS verify each step is complete before moving to the next.`,
          },
        });

        // Process agent messages and write to stream
        await writeAgentMessagesToStream(agentStream, writer);
      },
    });

    console.log('✨ Streaming response back to client');

    // Return proper AI SDK response
    return createUIMessageStreamResponse({
      stream,
    });
  } catch (error) {
    console.error('❌ Error in claude-agent route:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
