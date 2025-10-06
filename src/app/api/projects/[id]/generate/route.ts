import * as Sentry from '@sentry/nextjs';
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessageStreamWriter } from 'ai';
import { db } from '@/lib/db/client';
import { projects, messages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { readFile } from 'fs/promises';
import { join } from 'path';

// Create instrumented query function (automatically uses claudeCodeIntegration options)
const query = Sentry.createInstrumentedClaudeQuery();

export const maxDuration = 30;

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

async function writeAgentMessagesToStream(
  agentStream: AsyncGenerator<AgentMessage>,
  writer: UIMessageStreamWriter,
  projectId: string,
  expectedCwd: string
) {
  let currentMessageId: string | null = null;
  let messageStarted = false;
  let currentMessageParts: Array<{ type: string; text?: string; toolCallId?: string; toolName?: string; input?: unknown; output?: unknown }> = [];
  let messageCount = 0;

  console.log('🔄 Starting to process agent stream...');

  for await (const message of agentStream) {
    messageCount++;
    console.log(`📦 Agent Message #${messageCount}:`, JSON.stringify(message, null, 2));

    if (message.type === 'system' && message.subtype === 'init') {
      continue;
    }

    if (message.type === 'assistant') {
      const content = message.message?.content;
      const assistantMessageId = message.message?.id || message.uuid;

      if (assistantMessageId !== currentMessageId) {
        // Save previous message to DB
        if (messageStarted && currentMessageId && currentMessageParts.length > 0) {
          await db.insert(messages).values({
            projectId,
            role: 'assistant',
            content: currentMessageParts,
          });
          currentMessageParts = [];
        }

        if (messageStarted && currentMessageId) {
          writer.write({ type: 'finish' });
        }

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
            const textBlockId = `${assistantMessageId}-text-${Date.now()}`;

            writer.write({ type: 'text-start', id: textBlockId });
            writer.write({ type: 'text-delta', id: textBlockId, delta: block.text });
            writer.write({ type: 'text-end', id: textBlockId });

            currentMessageParts.push({ type: 'text', text: block.text });
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
                  console.error(`   Expected CWD: ${expectedCwd}`);

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

            writer.write({
              type: 'tool-input-available',
              toolCallId: block.id,
              toolName: block.name,
              input: block.input,
            });

            currentMessageParts.push({
              type: `tool-${block.name}`,
              toolCallId: block.id,
              toolName: block.name,
              input: block.input,
            });
          }
        }
      }
    }
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

            // Find the corresponding tool in currentMessageParts and add output
            const toolPart = currentMessageParts.find(
              p => p.toolCallId === block.tool_use_id
            );
            if (toolPart) {
              toolPart.output = block.content;
            }
          }
        }
      }
    }
    else if (message.type === 'result') {
      // Save final message to DB
      if (messageStarted && currentMessageId && currentMessageParts.length > 0) {
        await db.insert(messages).values({
          projectId,
          role: 'assistant',
          content: currentMessageParts,
        });
      }

      if (messageStarted && currentMessageId) {
        writer.write({ type: 'finish' });
        messageStarted = false;
      }
    }
    else if (message.type === 'error') {
      console.error('❌ Agent Error:', message.error);
      writer.write({
        type: 'error',
        errorText: typeof message.error === 'string' ? message.error : JSON.stringify(message.error),
      });

      // Update project status to failed
      await db.update(projects)
        .set({
          status: 'failed',
          errorMessage: typeof message.error === 'string' ? message.error : JSON.stringify(message.error),
        })
        .where(eq(projects.id, projectId));
    }
  }

  if (messageStarted && currentMessageId) {
    writer.write({ type: 'finish' });
  }

  console.log(`✅ Agent stream processing complete. Total messages: ${messageCount}`);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  console.log('📨 Received generation request for project:', id);

  try {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get project from DB
    const project = await db.select().from(projects).where(eq(projects.id, id)).limit(1);

    if (project.length === 0) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Update status to in_progress
    await db.update(projects)
      .set({ status: 'in_progress', lastActivityAt: new Date() })
      .where(eq(projects.id, id));

    // Save user message to DB
    await db.insert(messages).values({
      projectId: id,
      role: 'user',
      content: [{ type: 'text', text: prompt }],
    });

    const stream = createUIMessageStream({
      async execute({ writer }) {
        console.log('🎯 Starting Claude Code generation...');
        console.log('   Execute function called, writer:', !!writer);

        try {
          // IMPORTANT: Declare these BEFORE using them in template strings
          const projectsDir = join(process.cwd(), 'projects');
          const projectName = project[0].slug;

          console.log('🗂️  CWD:', projectsDir);
          console.log('📁 Project name:', projectName);

          const systemPrompt = `You are a helpful coding assistant specialized in building JavaScript applications and prototyping ideas.

🚨 CRITICAL PATH REQUIREMENTS 🚨

Your current working directory (CWD) is set to:
${projectsDir}

This means you are ALREADY INSIDE the projects directory. When you run commands, you are executing them FROM this location.

PROJECT TO CREATE: ${projectName}

PATH RULES - READ CAREFULLY:
1. Use ONLY relative paths from your CWD (${projectsDir})
2. NEVER construct absolute paths starting with /Users/, /home/, or /Desktop/
3. NEVER use paths with usernames in them
4. The project directory is simply: ${projectName} (just the name, nothing else)

CORRECT COMMAND EXAMPLES:
✅ npx create-vite@latest ${projectName} -- --template react-ts
✅ cd ${projectName} && npm install
✅ ls ${projectName}
✅ cat ${projectName}/package.json
✅ ls -la ${projectName}

INCORRECT COMMANDS - NEVER DO THIS:
❌ ls -la /Users/anyone/${projectName}
❌ cd /Users/droddy/Desktop/sentryvibe/projects/${projectName}
❌ ls /Users/codydearkland/sentryvibe/projects/${projectName}
❌ Any command with /Users/ or /home/ in it

If you need to reference the project, use: ${projectName}
If you need to reference a file in the project, use: ${projectName}/filename
That's it. No absolute paths. No usernames. Just relative paths from your CWD.

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

3. After completion, test the build by attempting to start the application:
   - For Next.js projects: Use PORT=3001 to avoid conflicts with the main app (running on 3000)
   - For Vite projects: Use PORT=5174 to avoid conflicts
   - Start the dev server in the background using Bash with the appropriate port
   - Wait 3-5 seconds for server to initialize
   - Check ONCE using BashOutput to see if server started successfully
   - Look for "Local:" or "ready" or port number in output
   - If you see those indicators, the server is running - KILL THE PROCESS IMMEDIATELY
   - Do NOT repeatedly check BashOutput - one check is sufficient
   - After verifying, ALWAYS use KillShell to stop the dev server
   - DO NOT leave the server running - it's only for testing
   - Update todo status after completing

4. CRITICAL: After testing is complete:
   - DO NOT tell the user to manually start the server
   - DO NOT start the server yourself via Bash
   - Tell the user: "Your project is ready! Click the Start button in the preview panel to run it."
   - The UI will handle proper port allocation and preview

5. After the user starts the server via the UI, offer to install Sentry:
   - Ask if the user wants Sentry installed
   - If yes, consult Sentry documentation for the correct installation method
   - Follow Sentry's official setup guide for the specific framework

IMPORTANT RULES:
- NEVER check BashOutput more than 2-3 times for the same process
- ALWAYS kill background processes when done testing
- If a dev server starts successfully (shows port/ready), IMMEDIATELY kill it and move on
- Do NOT wait for processes to complete if they are servers (they run indefinitely)
- ALWAYS keep your todo list updated as you progress
- Use import type for all type-only imports

NEVER manually create project files when a CLI tool exists.
ALWAYS verify each step is complete before moving to the next.
ALWAYS track your progress with TodoWrite.`;

          console.log('📄 System prompt created, length:', systemPrompt.length);

          const fullPrompt = `Create this project in the directory: ${projectName}\n\n${prompt}`;
          console.log('📝 Full prompt to Claude:', fullPrompt.substring(0, 200) + '...');

          const agentStream = query({
            prompt: fullPrompt,
            inputMessages: [{ role: 'system', content: systemPrompt }],
            options: {
              model: 'claude-sonnet-4-5',
              cwd: projectsDir,
              permissionMode: 'bypassPermissions',
              maxTurns: 100,
              systemPrompt,
            },
          }) as AsyncGenerator<AgentMessage>;

          console.log('✅ Agent stream created, beginning iteration...');

          await writeAgentMessagesToStream(agentStream, writer, id, projectsDir);

          console.log('✅ Agent stream completed successfully');

          // Update project status to completed
          await db.update(projects)
            .set({ status: 'completed', lastActivityAt: new Date() })
            .where(eq(projects.id, id));

          console.log('✅ Project marked as completed');

          // Try to detect project metadata (runCommand, projectType, port)
          try {
            const packageJsonPath = join(project[0].path, 'package.json');
            const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));

            let runCommand = 'npm run dev';
            let projectType = 'unknown';
            let port = 3000;

            // Detect project type and run command
            // NOTE: Actual port will be allocated dynamically when starting the server
            // Check in priority order (most specific first)
            if (packageJson.dependencies?.next || packageJson.devDependencies?.next) {
              projectType = 'next';
              runCommand = 'npm run dev';
              port = 3001;
            } else if (packageJson.dependencies?.astro || packageJson.devDependencies?.astro) {
              projectType = 'astro';
              runCommand = 'npm run dev';
              port = 4321; // Astro default
            } else if (packageJson.dependencies?.['@angular/core']) {
              projectType = 'angular';
              runCommand = 'npm run start';
              port = 4200; // Angular default
            } else if (packageJson.devDependencies?.vite && !packageJson.dependencies?.astro) {
              projectType = 'vite';
              runCommand = 'npm run dev';
              port = 5173;
            } else if (packageJson.scripts?.dev) {
              // Fallback: Has a dev script but unknown type
              projectType = 'unknown';
              runCommand = 'npm run dev';
              port = 3001;
            }

            await db.update(projects)
              .set({ runCommand, projectType, port })
              .where(eq(projects.id, id));

            console.log('✅ Detected project metadata:', { projectType, runCommand, port });
          } catch (error) {
            console.warn('⚠️  Could not detect project metadata:', error);
          }

        } catch (innerError) {
          console.error('❌ Inner generation error (inside execute):', innerError);
          console.error('   Error type:', innerError?.constructor?.name);
          console.error('   Error message:', innerError instanceof Error ? innerError.message : 'Unknown');
          console.error('   Error stack:', innerError instanceof Error ? innerError.stack : 'No stack');

          await db.update(projects)
            .set({
              status: 'failed',
              errorMessage: innerError instanceof Error ? innerError.message : 'Unknown error',
            })
            .where(eq(projects.id, id));
          throw innerError;
        }
      },
    });

    console.log('✨ Streaming response back to client');

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error('❌ Error in generate route:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
