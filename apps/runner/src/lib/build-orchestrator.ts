/**
 * Build Orchestrator - Handles complete build workflow
 * This replicates the functionality from the old /api/projects/[id]/generate route
 */

import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { selectTemplateFromPrompt, getTemplateSelectionContext, type Template } from './templates/config.js';
import { downloadTemplate, getProjectFileTree } from './templates/downloader.js';
import { getWorkspaceRoot } from './workspace.js';
import { CLAUDE_SYSTEM_PROMPT } from '@sentryvibe/agent-core';

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
    console.log(`[orchestrator] Target directory: ${workingDirectory}`);

    // Download template to project directory (pass exact path, not just name)
    const downloadedPath = await downloadTemplate(selectedTemplate, workingDirectory);
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

  const sections: string[] = [];

  if (isNewProject && template) {
    sections.push(`## New Project: Template Prepared

- Template: ${template.name}
- Location: ${projectPath}
- Framework: ${template.tech.framework}

Project structure snapshot:
${fileTree}

Before customizing, run:
1. \`cd ${projectName} && npm install\`
2. Review the scaffold to understand existing routes, components, and configs.
3. Implement the requested features directly inside this template—do **not** scaffold a fresh project.

Template notes:
${template.ai?.systemPromptAddition || 'No additional template notes provided.'}

Included features:
${template.ai?.includedFeatures?.map(f => `- ${f}`).join('\n') || '- (template features not listed)'}

Key commands:
- Install: ${template.setup.installCommand}
- Dev: ${template.setup.devCommand}
- Build: ${template.setup.buildCommand}`);
  } else if (!isNewProject) {
    sections.push(`## Existing Project Context

- Project location: ${projectPath}
- Objective: update the existing codebase to satisfy the latest request.

Current structure snapshot:
${fileTree}

Review the relevant files, confirm dependencies, and plan how your changes integrate without breaking current behavior.`);
  }

  sections.push(`## Workspace Rules
- Your command cwd is ${workspaceRoot}. Stay inside this workspace unless explicitly instructed otherwise.
- Refer to the project as \`${projectName}\` and use relative paths (e.g., \`${projectName}/src/App.tsx\`).
- Avoid absolute paths that include user directories (e.g., \`/Users/.../${projectName}\`).`);

  sections.push(`## Build & Runtime Expectations
- Manage dependencies with npm: \`cd ${projectName} && npm install\`.
- Do not start background dev servers; the platform manages runtime previews.
- For Vite projects, ensure \`vite.config.*\` allows Cloudflare tunnels:

\`\`\`ts
export default defineConfig({
  server: {
    allowedHosts: ['.trycloudflare.com'],
  },
});
\`\`\`

- In TypeScript projects with \`verbatimModuleSyntax\`, prefer explicit type imports (\`import type {...}\`).`);

  sections.push(`## Communication & Quality
- Narrate major steps and results in the chat so progress stays visible.
- When editing files, provide complete, production-ready content—no placeholders.
- Close with a concise summary covering shipped features, validation (tests, lint, manual checks), and follow-up work.`);

  return [CLAUDE_SYSTEM_PROMPT.trim(), ...sections].join('\n\n');
}
