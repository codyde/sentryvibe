import * as Sentry from '@sentry/nextjs';
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessageStreamWriter } from 'ai';
import { db } from '@/lib/db/client';
import { projects, messages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getTemplateById, getTemplateSelectionContext } from '@/lib/templates/config';
import { downloadTemplate, getProjectFileTree } from '@/lib/templates/downloader';
import {
  reservePortForProject,
  releasePortForProject,
  updatePortReservationForProject,
  buildEnvForFramework,
  getRunCommand,
} from '@/lib/port-allocator';
import { getWorkspaceRoot } from '@/lib/workspace';

const WORKSPACE_ROOT = getWorkspaceRoot();

// Create instrumented query function (automatically uses claudeCodeIntegration options)
const query = Sentry.createInstrumentedClaudeQuery({
  default: {
    cwd: WORKSPACE_ROOT,
  },
});

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
  expectedCwd: string,
  projectName: string
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
          const projectsDir = WORKSPACE_ROOT;
          const projectName = project[0].slug;
          const projectPath = project[0].path;

          console.log('🗂️  CWD:', projectsDir);
          console.log('📁 Project name:', projectName);
          console.log('📂 Project path:', projectPath);

          // Check if this is a NEW project (no files yet) or EXISTING project (follow-up chat)
          const { existsSync } = await import('fs');
          const { readdir } = await import('fs/promises');

          let isNewProject = false;
          let selectedTemplate: any = null;
          let fileTree = '';

          try {
            if (existsSync(projectPath)) {
              const files = await readdir(projectPath);
              isNewProject = files.length === 0;
              console.log(`📊 Project exists: ${files.length} files found`);
            } else {
              isNewProject = true;
              console.log(`📊 Project directory doesn't exist - NEW project`);
            }
          } catch {
            isNewProject = true;
          }

          if (isNewProject) {
            console.log('🆕 NEW PROJECT - Downloading template...');

            // STEP 1: Send initial setup todos to UI
            console.log('📝 Creating initial setup todos...');
            writer.write({
              type: 'tool-input-available',
              toolCallId: 'setup-todo-1',
              toolName: 'TodoWrite',
              input: {
                todos: [
                  { content: 'Select appropriate template', status: 'in_progress', activeForm: 'Selecting template' },
                  { content: 'Download template from GitHub', status: 'pending', activeForm: 'Downloading template' },
                ],
              },
            });

            // AUTO-SELECT AND DOWNLOAD TEMPLATE
            console.log('🎯 Auto-selecting template based on prompt...');
            const { selectTemplateFromPrompt } = await import('@/lib/templates/config');
            selectedTemplate = await selectTemplateFromPrompt(prompt);

            console.log(`✅ Selected template: ${selectedTemplate.name} (${selectedTemplate.id})`);

            // Update todo: template selected
            writer.write({
              type: 'tool-input-available',
              toolCallId: 'setup-todo-2',
              toolName: 'TodoWrite',
              input: {
                todos: [
                  { content: `Selected: ${selectedTemplate.name}`, status: 'completed', activeForm: 'Selecting template' },
                  { content: `Download template: ${selectedTemplate.repository}`, status: 'in_progress', activeForm: 'Downloading template' },
                ],
              },
            });

            console.log(`   Downloading from: ${selectedTemplate.repository}`);

            // Download template
            const downloadedPath = await downloadTemplate(selectedTemplate, projectName);

            // Update project metadata
            await db.update(projects)
              .set({
                path: downloadedPath,
                projectType: selectedTemplate.tech.framework,
                runCommand: selectedTemplate.setup.devCommand,
                port: selectedTemplate.setup.defaultPort,
              })
              .where(eq(projects.id, id));

            console.log(`✅ Template downloaded to: ${downloadedPath}`);

            // Update todo: template downloaded
            writer.write({
              type: 'tool-input-available',
              toolCallId: 'setup-todo-3',
              toolName: 'TodoWrite',
              input: {
                todos: [
                  { content: `Selected: ${selectedTemplate.name}`, status: 'completed', activeForm: 'Selecting template' },
                  { content: `Downloaded to: projects/${projectName}`, status: 'completed', activeForm: 'Downloading template' },
                ],
              },
            });

            // Get file tree for context
            fileTree = await getProjectFileTree(downloadedPath);
          } else {
            console.log('🔄 EXISTING PROJECT - Skipping template download');

            // For existing projects, just get the file tree
            fileTree = await getProjectFileTree(projectPath);

            // Try to load template info from project metadata
            if (project[0].projectType) {
              const { getTemplateById } = await import('@/lib/templates/config');
              // Map projectType to template ID
              const templateIdMap: Record<string, string> = {
                'vite': 'react-vite',
                'next': 'nextjs-fullstack',
                'astro': 'astro-static',
              };
              const templateId = templateIdMap[project[0].projectType] || 'react-vite';
              selectedTemplate = await getTemplateById(templateId);
            }
          }

          // Load template selection context (for reference in prompt)
          const templateContext = await getTemplateSelectionContext();

          const systemPrompt = `You are a helpful coding assistant specialized in building JavaScript applications and prototyping ideas.

${isNewProject ? `🎯 NEW PROJECT - TEMPLATE ALREADY DOWNLOADED

✅ **A template has been automatically selected and downloaded for you:**

Template: ${selectedTemplate?.name || 'Unknown'}
Location: ${projectPath}
Framework: ${selectedTemplate?.tech?.framework || project[0].projectType || 'Unknown'}

**Project Structure:**
${fileTree}

${selectedTemplate?.ai?.systemPromptAddition || ''}

**Included Features:**
${selectedTemplate?.ai?.includedFeatures?.map((f: string) => `  • ${f}`).join('\n') || ''}

**Setup Commands:**
  Install: ${selectedTemplate?.setup?.installCommand || 'pnpm install'}
  Dev: ${selectedTemplate?.setup?.devCommand || 'pnpm dev'}
  Build: ${selectedTemplate?.setup?.buildCommand || 'pnpm build'}

**Your Task:**
The template is already downloaded and ready. You need to:
1. Install dependencies
2. Customize the template to match the user's specific requirements
3. Add any additional features requested

DO NOT scaffold a new project - the template is already there!
DO NOT run create-next-app, create-vite, etc. - skip that step!
START by installing dependencies, THEN customize the existing code.` : `🔄 EXISTING PROJECT - FOLLOW-UP CHAT

This is an EXISTING project that you're modifying.

**Project Location:** ${projectPath}
**Project Type:** ${project[0].projectType || 'Unknown'}

**Current Project Structure:**
${fileTree}

**Your Task:**
The user wants you to make changes to this existing project.
1. Review what's already there (see structure above)
2. Make the requested changes
3. Update or add files as needed
4. Test if necessary

DO NOT download or scaffold anything - just modify the existing code!`}

🧠 HOLISTIC THINKING - CRITICAL 🧠

BEFORE writing ANY code or creating ANY files, you MUST think comprehensively:

1. Consider the ENTIRE project:
   - What files will this project need?
   - How do components depend on each other?
   - What's the complete dependency tree?

2. Review existing context:
   - Check what's already in the project
   - Understand the current architecture
   - Identify what needs updating vs creating new

3. Plan the full implementation:
   - Map out all files you'll create
   - List all dependencies needed upfront
   - Anticipate how changes affect other parts

This holistic approach is ABSOLUTELY ESSENTIAL. NEVER write code in isolation.

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
❌ cd ${projectsDir}/${projectName}
❌ ls ${projectsDir}/${projectName}
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

CRITICAL: When you're done with all customization work:
1. Mark your final todo as "completed"
2. Write a summary of what was built
3. Tell the user: "Your project is ready! The dev server will start automatically in a few seconds."

The system will automatically start the dev server when you're done - no action needed from you or the user!

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

📄 COMPLETE FILE CONTENTS - NO PLACEHOLDERS 📄

CRITICAL: When writing or updating ANY file, you MUST write the COMPLETE file contents:

✅ CORRECT: Include ALL code from start to finish
❌ WRONG: // ... rest of the code remains the same
❌ WRONG: // [previous code here]
❌ WRONG: /* keeping existing implementation */
❌ WRONG: <-- leave original code -->

If you need to update a file:
1. Read the current file contents
2. Make your changes
3. Write the ENTIRE updated file with ALL code

NEVER use placeholders, shortcuts, or partial updates.
EVERY file must be complete and immediately usable.

Example:
If App.tsx has 50 lines and you change line 10:
- Write all 50 lines (with your change on line 10)
- Include imports, all functions, exports - everything
- NO shortcuts!

💭 BRIEF PLANNING FIRST 💭

Before executing, briefly state your plan (2-4 lines max):

Example:
User: "Create a todo list app"
You: "I'll:
1. Scaffold Vite + React + TypeScript
2. Create Todo type, TodoList/TodoItem components with state
3. Add localStorage persistence hook
4. Style with Tailwind

Starting now..."

Then proceed with implementation. Keep planning concise!

🛠️ CRITICAL WORKFLOW - FOLLOW THIS EXACT SEQUENCE:

The template has ALREADY been downloaded for you. You can see the structure above.

When customizing this project, you MUST:

1. CREATE TODO LIST:
   - Use TodoWrite to create a comprehensive task list
   - Break down customization work into specific steps
   - Include: installing deps, customizing components, adding features, testing
   - This is your roadmap for the project

2. INSTALL DEPENDENCIES:
   - cd into the project directory (${projectName})
   - Run the template's install command: ${selectedTemplate.setup.installCommand}
   - Verify installation completed successfully

📦 DEPENDENCIES-FIRST STRATEGY:

CRITICAL: When you need dependencies, add them to package.json FIRST:

✅ CORRECT workflow:
1. Update package.json with ALL dependencies you'll need
   {
     "dependencies": {
       "react-query": "^5.0.0",
       "zustand": "^4.4.0",
       "lucide-react": "^0.300.0"
     }
   }
2. Run: cd ${projectName} && npm install
3. THEN create files that use those dependencies

❌ WRONG workflow:
1. Create file using react-query
2. npm install react-query
3. Create file using zustand
4. npm install zustand
(This is inefficient and error-prone!)

Add ALL dependencies upfront, install once, then code.

3. After customization is complete:
   - Verify your changes work by reviewing the code
   - Make sure all required dependencies are installed
   - Mark your final todo as completed
   - Write a summary of what was built
   - The system will automatically start the dev server for you

IMPORTANT:
- DO NOT manually test the dev server with Bash
- DO NOT run create-next-app, create-vite, or any scaffolding commands
- DO NOT start/stop servers manually
- The system handles server management automatically

🎨 DESIGN & UX EXCELLENCE 🎨

Create production-ready, professional applications:

Visual Design:
- Cohesive color system (primary, secondary, accent + status colors: success, warning, error)
- Modern typography: 16px+ body text, clear hierarchy, readable fonts
- Subtle shadows and rounded corners (8-12px) for polished look
- Smooth animations and transitions (hover, focus, active states)

🌈 TAILWIND CSS v4 COLOR CONFIGURATION - CRITICAL 🌈

IMPORTANT: This project uses Tailwind CSS v4, which requires FUNCTION SYNTAX for colors:

✅ CORRECT formats in globals.css or app.css:
  --primary: rgb(117 83 255);
  --primary: oklch(0.64 0.21 276);

❌ WRONG formats (Tailwind v3 - DO NOT USE):
  --primary: 117 83 255;
  --primary: #7553FF;

When defining CSS variables for Tailwind colors:
1. Use rgb() or oklch() function syntax
2. Inside the function, use space-separated values (NO commas)
3. Apply this to ALL color variables in :root

Example correct globals.css:
:root {
  --background: rgb(18 12 37);
  --foreground: rgb(255 255 255);
  --primary: rgb(117 83 255);
  --border: rgb(78 42 154);
}

OR with OKLCH (modern, perceptually uniform):
:root {
  --background: oklch(0.24 0.05 294);
  --primary: oklch(0.64 0.21 276);
}

Both formats work, but you MUST use the function syntax in Tailwind v4!

Content & Features:
- NEVER create blank or placeholder screens
- Populate with realistic demo data (5-10 items minimum)
- Include ALL UI states:
  * Loading: Skeleton loaders or spinners
  * Empty: Helpful empty states with clear CTAs
  * Error: User-friendly error messages with retry options
  * Success: Confirmation feedback

Responsive Design:
- Mobile-first approach
- Test breakpoints: <768px (mobile), 768-1024px (tablet), >1024px (desktop)
- Fluid grids with CSS Grid/Flexbox
- Touch-friendly targets on mobile (44px minimum)

Accessibility:
- Semantic HTML elements
- ARIA labels for screen readers
- Keyboard navigation support
- Minimum 4.5:1 color contrast (WCAG AA)

Example Quality Bar:
If building a todo list:
- Include 5-7 sample todos
- Show add form with validation
- Empty state: "No todos yet! Add one above"
- Loading state when fetching
- Error state with retry button
- Filter options (all/active/completed)
- Smooth animations for adding/removing

📁 CODE ORGANIZATION & MODULARITY 📁

Write clean, maintainable code:

File Size:
- Keep files under 250 lines when possible
- Extract large components into smaller sub-components
- Split utilities into separate files

Structure by Feature:
${projectName}/
├── src/
│   ├── components/
│   │   ├── TodoList/          ← Feature folder
│   │   │   ├── TodoList.tsx
│   │   │   ├── TodoItem.tsx
│   │   │   └── useTodos.ts    ← Custom hook
│   │   └── Header.tsx
│   ├── lib/
│   │   ├── api.ts             ← API functions
│   │   └── storage.ts         ← Storage utils
│   ├── types/
│   │   └── index.ts           ← All types
│   └── App.tsx

Code Quality:
- Single Responsibility Principle
- DRY (Don't Repeat Yourself)
- Clear naming conventions
- Proper TypeScript typing
- Extract reusable logic to hooks/utils

🖼️ IMAGES & ASSETS 🖼️

For demo/prototype applications:
- Use Pexels stock photos for realistic demos
- Link to images, NEVER download them
- Choose domain-relevant images

Example URLs (known valid):
- Hero images: https://images.pexels.com/photos/1181676/pexels-photo-1181676.jpeg
- People/avatars: https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg
- Food: https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg
- Tech: https://images.pexels.com/photos/546819/pexels-photo-546819.jpeg

For icons: Use lucide-react (install via npm)

IMPORTANT RULES:
- DO NOT manually test or start dev servers - the system handles this
- DO NOT run scaffolding commands (create-vite, create-next-app, etc.) - template is already there
- ALWAYS keep your todo list updated as you progress
- Use import type for all type-only imports
- Write COMPLETE file contents (no placeholders!)
- Add ALL dependencies to package.json upfront
- ALWAYS verify each step is complete before moving to the next
- Track your progress with TodoWrite
- Think holistically about the entire project

The template is pre-downloaded. Your job is to customize it, not create it from scratch.`;

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

          await writeAgentMessagesToStream(agentStream, writer, id, projectsDir, projectName);

          console.log('✅ Agent stream completed successfully');

          // Update project status to completed
          await db.update(projects)
            .set({ status: 'completed', lastActivityAt: new Date() })
            .where(eq(projects.id, id));

          console.log('✅ Project marked as completed');

          // Try to detect project metadata (runCommand, projectType, port)
          // NOTE: This should already be set from template download, but check package.json to confirm
          try {
            const packageJsonPath = join(projectPath, 'package.json');
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

            // AUTO-START DEV SERVER AFTER SUCCESSFUL GENERATION
            if (runCommand) {
              console.log('🚀 Auto-starting dev server in 3 seconds...');

              // Wait 3 seconds to ensure all file writes are complete
              await new Promise(resolve => setTimeout(resolve, 3000));

              try {
                // Import required utilities
                const { startDevServer } = await import('@/lib/process-manager');
                // Get the latest project data
                const freshProject = await db.select().from(projects).where(eq(projects.id, id)).limit(1);

                if (freshProject[0] && freshProject[0].runCommand) {
                  const proj = freshProject[0];

                  const { port: reservedPort, framework } = await reservePortForProject({
                    projectId: id,
                    projectType: proj.projectType,
                    runCommand: proj.runCommand,
                    preferredPort: proj.port || undefined,
                  });

                  await db.update(projects)
                    .set({
                      devServerStatus: 'starting',
                      devServerPort: reservedPort,
                      lastActivityAt: new Date(),
                    })
                    .where(eq(projects.id, id));

                  console.log(`   Reserved port: ${reservedPort}`);

                  const command = getRunCommand(proj.runCommand || 'npm run dev');
                  const env = buildEnvForFramework(framework, reservedPort);
                  console.log(`   Command: ${command}`);

                  const { pid, emitter } = startDevServer({
                    projectId: id,
                    command,
                    cwd: proj.path,
                    env,
                  });

                  const finalPort = await new Promise<number>((resolve) => {
                    const timeout = setTimeout(() => {
                      console.log(`   Using reserved port: ${reservedPort}`);
                      resolve(reservedPort);
                    }, 8000);

                    emitter.once('port', (p: number) => {
                      clearTimeout(timeout);
                      console.log(`   Detected port: ${p}`);
                      resolve(p);
                    });
                  });

                  if (finalPort !== reservedPort) {
                    await updatePortReservationForProject(id, finalPort);
                  }

                  await db.update(projects)
                    .set({
                      devServerPid: pid,
                      devServerPort: finalPort,
                      port: finalPort,
                      devServerStatus: 'running',
                      lastActivityAt: new Date(),
                    })
                    .where(eq(projects.id, id));

                  console.log('✅ Dev server auto-started successfully');
                  console.log(`   PID: ${pid}, Port: ${finalPort}`);

                  emitter.once('exit', async ({ code, signal }: { code: number | null; signal: NodeJS.Signals | null }) => {
                    console.log(`Dev server for ${id} exited with code ${code}`);
                    await db.update(projects)
                      .set({
                        devServerPid: null,
                        devServerPort: null,
                        devServerStatus: code === 0 || signal === 'SIGTERM' || signal === 'SIGINT' ? 'stopped' : 'failed',
                      })
                      .where(eq(projects.id, id));
                    await releasePortForProject(id);
                  });

                  // Handle process errors
                  emitter.once('error', async (error: Error) => {
                    console.error(`Dev server error for ${id}:`, error);
                    await db.update(projects)
                      .set({
                        devServerPid: null,
                        devServerPort: null,
                        devServerStatus: 'failed',
                        errorMessage: error.message,
                      })
                      .where(eq(projects.id, id));
                  });
                }
              } catch (startError) {
                console.error('❌ Failed to auto-start dev server:', startError);
                // Update status to failed
                await db.update(projects)
                  .set({
                    devServerStatus: 'failed',
                    errorMessage: startError instanceof Error ? startError.message : 'Failed to auto-start',
                  })
                  .where(eq(projects.id, id));
              }
            }
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
