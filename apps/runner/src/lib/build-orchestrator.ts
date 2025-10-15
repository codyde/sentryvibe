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
import { type AgentId } from '@sentryvibe/agent-core';

export interface BuildContext {
  projectId: string;
  projectName: string;
  prompt: string;
  operationType: string;
  workingDirectory: string;
  agent: AgentId;
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
  const { projectId, projectName, prompt, workingDirectory, agent } = context;
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

  const isCodexAgent = agent === 'openai-codex';
  let templateSelectionContext: string | undefined;

  if (isNewProject && !SKIP_TEMPLATES) {
    if (isCodexAgent) {
      console.log('[orchestrator] NEW PROJECT (Codex) - Deferring template selection to agent');
      templateSelectionContext = await getTemplateSelectionContext();
      fileTree = '';
    } else {
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
    }
  } else {
    console.log('[orchestrator] EXISTING PROJECT - Skipping template download');
    fileTree = await getProjectFileTree(workingDirectory);
  }

  // Prepare project metadata (for new projects with templates)
  const projectMetadata = !isCodexAgent && isNewProject && selectedTemplate ? {
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
    agent,
    templateSelectionContext,
  });

  // Generate full prompt
  let fullPrompt = prompt;
  if (isNewProject) {
    if (isCodexAgent) {
      fullPrompt = `${prompt}\n\nMANDATORY STEPS BEFORE CODING:\n1. Review the template catalog in your system instructions and choose the best-fitting template ID.\n2. Clone it into \"${projectName}\" using the repository and branch from the catalog: npx degit <repository>#<branch> \"${projectName}\".\n3. After cloning, create a .npmrc in the project root containing: \nenable-modules-dir=true\nshamefully-hoist=false\n4. Update all package.json \"name\" fields so the project identifies as \"${projectName}\".\n5. Verify the clone with commands like \`ls ${projectName}\` and summarize your execution plan before modifying files.`;
    } else {
      fullPrompt = `${prompt}\n\nCRITICAL: The template has ALREADY been downloaded to: ${workingDirectory}\nDO NOT run create-next-app, create-vite, or any scaffolding CLIs.\nSTART by installing dependencies, then customize the template.`;
    }
  }

  return {
    isNewProject,
    template: selectedTemplate,
    fileTree,
    systemPrompt,
    fullPrompt,
    projectPath: workingDirectory,
    templateEvents,
    projectMetadata,
  };
}

/**
 * Generate dynamic system prompt based on project context
 *
 * NOTE: This function returns ONLY the context-specific sections.
 * The base prompts (CLAUDE_SYSTEM_PROMPT or CODEX_SYSTEM_PROMPT) are added
 * by the respective query functions (createClaudeQuery/createCodexQuery) in index.ts.
 * This prevents double-injection of the base prompts.
 */
async function generateSystemPrompt(context: {
  isNewProject: boolean;
  template: Template | null;
  projectName: string;
  projectPath: string;
  workspaceRoot: string;
  fileTree: string;
  agent: AgentId;
  templateSelectionContext?: string;
}): Promise<string> {
  const {
    isNewProject,
    template,
    projectName,
    projectPath,
    workspaceRoot,
    fileTree,
    agent,
    templateSelectionContext,
  } = context;

  const sections: string[] = [];

  if (agent === 'openai-codex') {
    if (isNewProject) {
      sections.push(`## Template Selection Responsibilities

- Interpret the user's request and pick the template whose capabilities best match.
- Use the catalog below to reference template IDs, repositories, and branches.
- Clone the chosen template into "${projectName}" (within ${workspaceRoot}) using \`npx degit <repository>#<branch> "${projectName}"\`.
- After cloning, create a .npmrc in the project root containing:
  enable-modules-dir=true
  shamefully-hoist=false
- Update every package.json "name" field so the project identifies as "${projectName}".
- Confirm the clone (e.g., \`ls ${projectName}\`) and summarize your implementation plan before writing code.`);

      if (templateSelectionContext) {
        sections.push(`### Template Catalog
${templateSelectionContext}`);
      }
    } else {
      sections.push(`## Existing Project Context

- Project location: ${projectPath}
- Inspect the current codebase and apply the requested changes without re-scaffolding.`);
    }

    sections.push(`## Workspace Rules
- Commands execute from ${workspaceRoot}. Stay inside this workspace.
- Refer to the project as \`${projectName}\` when issuing relative paths.
- Never construct absolute paths that include user directories (e.g., /Users/.../${projectName}).`);

    sections.push(`## Quality Expectations
- Narrate key decisions and outcomes in the chat stream.
- Provide complete file contents—no placeholders or partial updates.
- Conclude with a summary, validation notes (tests, lint, manual checks), and clear next steps.`);

    return sections.join('\n\n');
  }

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

  return sections.join('\n\n');
}
