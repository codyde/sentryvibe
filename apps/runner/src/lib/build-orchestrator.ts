/**
 * Build Orchestrator - Handles complete build workflow
 * This replicates the functionality from the old /api/projects/[id]/generate route
 */

import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { selectTemplateFromPrompt, getTemplateSelectionContext, type Template } from './templates/config';
import { downloadTemplate, getProjectFileTree } from './templates/downloader';
import { getWorkspaceRoot } from './workspace';

export interface BuildContext {
  projectId: string;
  projectName: string;
  prompt: string;
  operationType: string;
  workingDirectory: string;
}

export interface OrchestrationResult {
  isNewProject: boolean;
  template: Template | null;
  fileTree: string;
  systemPrompt: string;
  fullPrompt: string;
  projectPath: string;
  templateEvents: Array<{type: string; data: any}>; // Events to send to UI
  projectMetadata?: {
    path: string;
    projectType: string;
    runCommand: string;
    port: number;
  };
}

/**
 * Orchestrate the build - handle templates, prompts, context
 */
export async function orchestrateBuild(context: BuildContext): Promise<OrchestrationResult> {
  const { projectId, projectName, prompt, workingDirectory } = context;
  const workspaceRoot = getWorkspaceRoot();

  // Check if this is a NEW project or EXISTING project
  let isNewProject = false;
  let selectedTemplate: Template | null = null;
  let fileTree = '';
  const templateEvents: Array<{type: string; data: any}> = [];

  try {
    if (existsSync(workingDirectory)) {
      const files = await readdir(workingDirectory);
      isNewProject = files.length === 0;
      console.log(`[orchestrator] Project exists: ${files.length} files found`);
    } else {
      isNewProject = true;
      console.log(`[orchestrator] Project directory doesn't exist - NEW project`);
    }
  } catch {
    isNewProject = true;
  }

  // Handle NEW projects - download template
  const SKIP_TEMPLATES = process.env.SKIP_TEMPLATES === 'true';

  if (isNewProject && !SKIP_TEMPLATES) {
    console.log('[orchestrator] NEW PROJECT - Downloading template...');

    // Send initial setup todos
    templateEvents.push({
      type: 'tool-input-available',
      data: {
        toolCallId: 'setup-todo-1',
        toolName: 'TodoWrite',
        input: {
          todos: [
            { content: 'Select appropriate template', status: 'in_progress', activeForm: 'Selecting template' },
            { content: 'Download template from GitHub', status: 'pending', activeForm: 'Downloading template' },
          ],
        },
      },
    });

    // Auto-select template
    console.log('[orchestrator] Auto-selecting template based on prompt...');
    selectedTemplate = await selectTemplateFromPrompt(prompt);
    console.log(`[orchestrator] Selected template: ${selectedTemplate.name} (${selectedTemplate.id})`);

    // Update todo: template selected
    templateEvents.push({
      type: 'tool-input-available',
      data: {
        toolCallId: 'setup-todo-2',
        toolName: 'TodoWrite',
        input: {
          todos: [
            { content: `Selected: ${selectedTemplate.name}`, status: 'completed', activeForm: 'Selecting template' },
            { content: `Download template: ${selectedTemplate.repository}`, status: 'in_progress', activeForm: 'Downloading template' },
          ],
        },
      },
    });

    console.log(`[orchestrator] Downloading from: ${selectedTemplate.repository}`);

    // Download template to project directory
    const downloadedPath = await downloadTemplate(selectedTemplate, projectName);
    console.log(`[orchestrator] Template downloaded to: ${downloadedPath}`);

    // Update todo: template downloaded
    templateEvents.push({
      type: 'tool-input-available',
      data: {
        toolCallId: 'setup-todo-3',
        toolName: 'TodoWrite',
        input: {
          todos: [
            { content: `Selected: ${selectedTemplate.name}`, status: 'completed', activeForm: 'Selecting template' },
            { content: `Downloaded to: ${projectName}`, status: 'completed', activeForm: 'Downloading template' },
          ],
        },
      },
    });

    // Complete template todos
    templateEvents.push({
      type: 'tool-output-available',
      data: {
        toolCallId: 'setup-todo-1',
        output: `Template selection completed`,
      },
    });
    templateEvents.push({
      type: 'tool-output-available',
      data: {
        toolCallId: 'setup-todo-2',
        output: `Template selected: ${selectedTemplate.name}`,
      },
    });
    templateEvents.push({
      type: 'tool-output-available',
      data: {
        toolCallId: 'setup-todo-3',
        output: `Template downloaded to ${downloadedPath}`,
      },
    });

    // Get file tree
    fileTree = await getProjectFileTree(downloadedPath);

  } else {
    console.log('[orchestrator] EXISTING PROJECT - Skipping template download');
    fileTree = await getProjectFileTree(workingDirectory);
  }

  // Prepare project metadata (for new projects with templates)
  const projectMetadata = isNewProject && selectedTemplate ? {
    path: workingDirectory,
    projectType: selectedTemplate.tech.framework,
    runCommand: selectedTemplate.setup.devCommand,
    port: selectedTemplate.setup.defaultPort,
  } : undefined;

  // Generate dynamic system prompt
  const systemPrompt = await generateSystemPrompt({
    isNewProject,
    template: selectedTemplate,
    projectName,
    projectPath: workingDirectory,
    workspaceRoot,
    fileTree,
  });

  // Generate full prompt
  const fullPrompt = isNewProject
    ? `${prompt}\n\nCRITICAL: The template has ALREADY been downloaded to: ${workingDirectory}\nDO NOT run create-next-app, create-vite, or any scaffolding CLIs.\nSTART by installing dependencies, then customize the template.`
    : prompt;

  return {
    isNewProject,
    template: selectedTemplate,
    fileTree,
    systemPrompt,
    fullPrompt,
    projectPath: workingDirectory,
    templateEvents,
  };
}

/**
 * Generate dynamic system prompt based on project context
 */
async function generateSystemPrompt(context: {
  isNewProject: boolean;
  template: Template | null;
  projectName: string;
  projectPath: string;
  workspaceRoot: string;
  fileTree: string;
}): Promise<string> {
  const { isNewProject, template, projectName, projectPath, workspaceRoot, fileTree } = context;

  const basePrompt = `You are a helpful coding assistant specialized in building JavaScript applications and prototyping ideas.

${isNewProject && template ? `🎯 NEW PROJECT - TEMPLATE ALREADY DOWNLOADED

✅ **A template has been automatically selected and downloaded for you:**

Template: ${template.name}
Location: ${projectPath}
Framework: ${template.tech.framework}

**Project Structure:**
${fileTree}

${template.ai?.systemPromptAddition || ''}

**Included Features:**
${template.ai?.includedFeatures?.map(f => `  • ${f}`).join('\n') || ''}

**Setup Commands:**
  Install: ${template.setup.installCommand}
  Dev: ${template.setup.devCommand}
  Build: ${template.setup.buildCommand}

**Your Task:**
The template is already downloaded and ready. You need to:
1. Install dependencies using: cd ${projectName} && npm install
2. Customize the template to match the user's specific requirements
3. Add any additional features requested

CRITICAL: ALWAYS use npm install (not pnpm or yarn) to avoid workspace conflicts.

DO NOT scaffold a new project - the template is already there!
DO NOT run create-next-app, create-vite, etc. - skip that step!
START by installing dependencies with npm install, THEN customize the existing code.` : !isNewProject ? `🔄 EXISTING PROJECT - FOLLOW-UP CHAT

This is an EXISTING project that you're modifying.

**Project Location:** ${projectPath}

**Current Project Structure:**
${fileTree}

**Your Task:**
The user wants you to make changes to this existing project.
1. Review what's already there (see structure above)
2. Make the requested changes
3. Update or add files as needed
4. Test if necessary

DO NOT download or scaffold anything - just modify the existing code!` : ''}

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
${workspaceRoot}

This means you are ALREADY INSIDE the projects directory. When you run commands, you are executing them FROM this location.

PROJECT TO WORK ON: ${projectName}

PATH RULES - READ CAREFULLY:
1. Use ONLY relative paths from your CWD (${workspaceRoot})
2. NEVER construct absolute paths starting with /Users/, /home/, or /Desktop/
3. NEVER use paths with usernames in them
4. The project directory is simply: ${projectName} (just the name, nothing else)

CORRECT COMMAND EXAMPLES:
✅ cd ${projectName} && npm install
✅ ls ${projectName}
✅ cat ${projectName}/package.json
✅ ls -la ${projectName}

INCORRECT COMMANDS - NEVER DO THIS:
❌ ls -la /Users/anyone/${projectName}
❌ cd ${workspaceRoot}/${projectName}
❌ ls ${workspaceRoot}/${projectName}
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
       {"content": "Install dependencies", "status": "pending", "activeForm": "Installing dependencies"},
       {"content": "Create TypeScript types", "status": "pending", "activeForm": "Creating TypeScript types"},
       {"content": "Build UI components", "status": "pending", "activeForm": "Building UI components"},
       {"content": "Project ready - Review and launch", "status": "pending", "activeForm": "Finalizing project"}
     ]
   }

CRITICAL: When you're done with all customization work:
1. Mark ALL todos as "completed"
2. Write a summary of what was built
3. Tell the user: "Your project is ready! The dev server will start automatically."

The system will automatically start the dev server when you're done!

🚫 CRITICAL: DO NOT RUN THE DEV SERVER 🚫

NEVER start the dev server yourself using Bash (npm run dev, npm start, etc.).
The system will automatically start the dev server after your build completes.
Your job is to:
1. Create all necessary files
2. Set up package.json with proper dependencies and scripts
3. Install dependencies (npm install, pnpm install, etc.)
4. Mark all todos as completed

DO NOT:
- Run background processes (npm run dev, npm start, etc.)
- Kill shells you started
- Leave any processes running

The dev server will be started automatically by the system once you're done.

🌐 VITE CONFIGURATION - CRITICAL FOR REMOTE PREVIEW 🌐

If this is a Vite project, you MUST configure vite.config.ts/js for Cloudflare Tunnel access:

\`\`\`typescript
export default defineConfig({
  server: {
    host: '0.0.0.0',  // Allow external connections
    hmr: { clientPort: 443 }  // HTTPS port for HMR through tunnel
  }
})
\`\`\`

This is REQUIRED for the preview to work remotely via Cloudflare tunnels.

🔧 TYPESCRIPT TYPE IMPORTS 🔧

CRITICAL: When working with TypeScript projects that have verbatimModuleSyntax enabled:

1. ALWAYS use explicit type imports for type-only imports:
   ✅ CORRECT: import type { MyType } from './types'
   ✅ CORRECT: import { myFunction, type MyType } from './utils'
   ❌ WRONG: import { MyType } from './types'

📄 COMPLETE FILE CONTENTS - NO PLACEHOLDERS 📄

CRITICAL: When writing or updating ANY file, you MUST write the COMPLETE file contents.
NO placeholders, shortcuts, or partial updates.
EVERY file must be complete and immediately usable.

🎨 DESIGN & UX EXCELLENCE 🎨

Create production-ready, professional applications with:
- Modern, cohesive design
- Realistic demo data (5-10 items)
- All UI states (loading, empty, error, success)
- Responsive, accessible interfaces

📦 DEPENDENCIES-FIRST STRATEGY:

CRITICAL: ALWAYS use npm (not pnpm or yarn) for installing dependencies to avoid workspace conflicts.

Add ALL dependencies to package.json FIRST, then run:
  cd ${projectName} && npm install

This ensures all dependencies install together in the project's own node_modules.

IMPORTANT RULES:
- DO NOT manually test or start dev servers
- ${isNewProject ? 'DO NOT run scaffolding commands - template is already there' : ''}
- ALWAYS keep your todo list updated
- Use import type for type-only imports
- Write COMPLETE file contents (no placeholders!)
- Add ALL dependencies upfront
- Think holistically about the entire project

${isNewProject ? 'The template is pre-downloaded. Your job is to customize it, not create it from scratch.' : ''}`;

  return basePrompt;
}
