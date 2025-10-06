import * as Sentry from '@sentry/nextjs';
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage, type UIMessageStreamWriter } from 'ai';
import type { MessageParam, ContentBlockParam } from '@anthropic-ai/sdk/resources';

// Create instrumented query function (automatically uses claudeCodeIntegration options)
const query = Sentry.createInstrumentedClaudeQuery();

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// Convert AI SDK UIMessage to Anthropic Messages API format
function convertUIMessageToAnthropicFormat(msg: UIMessage): MessageParam {
  const content: ContentBlockParam[] = [];

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
        const toolCallId = 'toolCallId' in part && typeof part.toolCallId === 'string' ? part.toolCallId : `tool_${Date.now()}`;
        const toolNameFromPart = 'toolName' in part && typeof part.toolName === 'string' ? part.toolName : toolName;
        content.push({
          type: 'tool_use',
          id: toolCallId,
          name: toolNameFromPart,
          input: part.input,
        });
      }

      // For tool results (user's tool result) - check if it has output
      if ('output' in part && part.output) {
        const toolCallId = 'toolCallId' in part && typeof part.toolCallId === 'string' ? part.toolCallId : `tool_${Date.now()}`;
        content.push({
          type: 'tool_result',
          tool_use_id: toolCallId,
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

// Define the agent message type
interface AgentMessage {
  type: string;
  subtype?: string;
  message?: {
    id?: string;
    content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: string }>;
  };
  uuid?: string;
  error?: unknown;
}

// Process Agent SDK messages and write to UI Message Stream
async function writeAgentMessagesToStream(
  agentStream: AsyncGenerator<AgentMessage>,
  writer: UIMessageStreamWriter
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
        currentMessageId = assistantMessageId ?? null;
        messageStarted = true;
        writer.write({
          type: 'start',
          messageId: assistantMessageId,
        });
      }

      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && block.text) {
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
          } else if (block.type === 'tool_use' && block.id && block.name) {
            // 🛡️ PATH VIOLATION DETECTION
            if (block.name === 'Bash' || block.name === 'Read' || block.name === 'Write' || block.name === 'Edit') {
              const input = block.input as any;
              const pathToCheck = input?.command || input?.file_path || input?.path || '';

              if (typeof pathToCheck === 'string') {
                // Check for absolute paths with /Users/ or /home/
                if (pathToCheck.includes('/Users/') || pathToCheck.includes('/home/')) {
                  console.error('🚨 PATH VIOLATION DETECTED:');
                  console.error(`   Tool: ${block.name}`);
                  console.error(`   Input: ${pathToCheck}`);
                  console.error(`   Expected CWD: ${projectsDir}`);

                  // Check if it's using wrong username
                  if (pathToCheck.includes('/Users/') && !pathToCheck.includes(process.env.USER || '')) {
                    console.error('   ⚠️  WARNING: Using different username in path!');
                  }
                }

                // Check for Desktop paths (common hallucination pattern)
                if (pathToCheck.includes('/Desktop/')) {
                  console.error('🚨 DESKTOP PATH DETECTED - Likely hallucinated:', pathToCheck);
                }
              }
            }

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
          if (block.type === 'tool_result' && block.tool_use_id) {
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
        console.log('🎯 Creating instrumented Claude Code query...');

        const projectsDir = '/Users/codydearkland/sentryvibe/projects';

        const systemPrompt = `You are a helpful coding assistant specialized in building JavaScript applications and prototyping ideas.

🚨 CRITICAL PATH REQUIREMENTS 🚨

Your current working directory (CWD) is set to:
${projectsDir}

This means you are ALREADY INSIDE the projects directory. When you run commands, you are executing them FROM this location.

PATH RULES - READ CAREFULLY:
1. Use ONLY relative paths from your CWD (${projectsDir})
2. NEVER construct absolute paths starting with /Users/, /home/, or /Desktop/
3. NEVER use paths with usernames in them
4. Project directories are simply: <project-name> (just the name, nothing else)

CORRECT COMMAND EXAMPLES:
✅ npx create-vite@latest my-app -- --template react-ts
✅ cd my-app && npm install
✅ ls my-app
✅ cat my-app/package.json
✅ ls -la

INCORRECT COMMANDS - NEVER DO THIS:
❌ ls -la /Users/anyone/my-app
❌ cd /Users/droddy/Desktop/sentryvibe/projects/my-app
❌ ls /Users/codydearkland/sentryvibe/projects/my-app
❌ Any command with /Users/ or /home/ in it

🎯 TASK MANAGEMENT - TODO VIBES 🎯

CRITICAL: You MUST use the TodoWrite tool to track your progress throughout the project:

1. AT THE START of every project:
   - Immediately create a comprehensive todo list with TodoWrite
   - Break down the project into specific, actionable tasks
   - Include all phases: scaffolding, development, testing, validation

2. DURING development:
   - Update todo status BEFORE starting each task (mark as "in_progress")
   - Update todo status IMMEDIATELY after completing each task (mark as "completed")
   - Add new todos if you discover additional work needed

3. Example todo structure (ALWAYS include a final summary task):
   {
     "todos": [
       {"content": "Scaffold project with Vite", "status": "pending", "activeForm": "Scaffolding project"},
       {"content": "Install dependencies", "status": "pending", "activeForm": "Installing dependencies"},
       {"content": "Create TypeScript types", "status": "pending", "activeForm": "Creating TypeScript types"},
       {"content": "Build UI components", "status": "pending", "activeForm": "Building UI components"},
       {"content": "Test dev server", "status": "pending", "activeForm": "Testing dev server"},
       {"content": "Project ready - Review and launch", "status": "pending", "activeForm": "Finalizing project"}
     ]
   }

CRITICAL: ALWAYS add a final todo called "Project ready - Review and launch" as the LAST task.
This final task should be marked as in_progress when you're done with all other work.
Use this task to summarize what was built and provide next steps.

This gives users visibility into your progress and creates a better experience!

🔧 TYPESCRIPT TYPE IMPORTS 🔧

CRITICAL: When working with TypeScript projects that have verbatimModuleSyntax enabled:

1. ALWAYS use explicit type imports for type-only imports:
   ✅ CORRECT: import type { MyType } from './types'
   ✅ CORRECT: import { myFunction, type MyType } from './utils'
   ❌ WRONG: import { MyType } from './types'

2. This applies to:
   - Interface imports
   - Type alias imports
   - Generic type imports
   - Any import that's only used as a type annotation

3. Error message you'll see if you get this wrong:
   "'MyType' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled."

4. Common fix pattern:
   Before: import { User, Post } from './types'
   After: import type { User, Post } from './types'

ALWAYS check your imports and use import type for type-only imports!

🛠️ CRITICAL WORKFLOW - FOLLOW THIS EXACT SEQUENCE:

When creating a new JavaScript project, you MUST:

1. CREATE TODO LIST FIRST:
   - Use TodoWrite to create a comprehensive task list
   - Break down all work into specific steps
   - This is your roadmap for the entire project

2. ALWAYS use CLI tools to scaffold projects - NEVER manually create project files:
   - For Next.js: npx create-next-app@latest <project-name>
   - For Vite + React: npm create vite@latest <project-name> -- --template react-ts
   - For other frameworks: use their official CLI scaffolding tools
   - Update todo status after completing

3. After completion, you may test the build:
   - If needed, start the dev server on PORT=5174 for testing
   - Check for errors and fix them
   - ALWAYS kill the server after testing
   - Update todo status after completing

4. CRITICAL: How to handle server starting requests:
   - If user asks to "start the server" or "run the app":
     * Tell them: "Click the Start button in the preview panel to run your project."
     * The UI handles proper port allocation automatically
   - NEVER start production dev servers via Bash in chat
   - Only start servers temporarily for testing, then kill immediately
   - The preview panel will handle port allocation (3001-3100 range)

5. After the user starts the server via the UI, offer to install Sentry:
   - Ask if the user wants Sentry installed
   - If yes, consult Sentry documentation for the correct installation method
   - Follow Sentry's official setup guide for the specific framework

IMPORTANT RULES:
- ALWAYS keep your todo list updated as you progress
- Use import type for all type-only imports
- Verify each step is complete before moving to the next

NEVER manually create project files when a CLI tool exists.
ALWAYS track your progress with TodoWrite.`;

        // Get only the LAST user message to avoid replaying entire conversation
        const lastUserMessage = messages[messages.length - 1];

        // Convert UI messages to Anthropic format for Sentry, including system prompt
        const inputMessages = [
          { role: 'system', content: systemPrompt },
          ...messages.map(convertUIMessageToAnthropicFormat)
        ];

        // Create Claude Agent SDK query with proper configuration
        const agentStream = query({
          // Pass only the new user message (SDK manages its own session state)
          prompt: lastUserMessage.parts.find(p => p.type === 'text')?.text || 'Continue',
          // Pass input messages for Sentry instrumentation (system + user messages)
          inputMessages: inputMessages,
          options: {
            model: 'claude-sonnet-4-5',
            cwd: '/Users/codydearkland/sentryvibe/projects',
            permissionMode: 'bypassPermissions',
            maxTurns: 100,
            systemPrompt: systemPrompt,
          },
        }) as AsyncGenerator<AgentMessage>;

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
