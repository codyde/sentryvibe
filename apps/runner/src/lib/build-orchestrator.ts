/**
 * Build Orchestrator - Handles complete build workflow
 * This replicates the functionality from the old /api/projects/[id]/generate route
 */

import { existsSync } from 'fs';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { selectTemplateFromPrompt, getTemplateSelectionContext, type Template } from './templates/config.js';
import { downloadTemplate, getProjectFileTree } from './templates/downloader.js';
import { getWorkspaceRoot } from './workspace.js';
import { type AgentId } from '@sentryvibe/agent-core';
import { resolveAgentStrategy, type AgentStrategyContext } from '@sentryvibe/agent-core/lib/agents';

export interface BuildContext {
  projectId: string;
  projectName: string;
  prompt: string;
  operationType: string;
  workingDirectory: string;
  agent: AgentId;
  template?: {
    id: string;
    name: string;
    framework: string;
    port: number;
    runCommand: string;
    repository: string;
    branch: string;
  }; // Frontend-provided template (NEW: from analysis endpoint)
}

export interface OrchestrationResult {
  isNewProject: boolean;
  template: Template | null;
  fileTree: string;
  systemPrompt: string;
  fullPrompt: string;
  projectPath: string;
  templateEvents: Array<{type: string; data: Record<string, unknown>}>; // Events to send to UI
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
  const { projectId, projectName, prompt, workingDirectory, agent, operationType, template: providedTemplate } = context;
  const workspaceRoot = getWorkspaceRoot();

  // Check if this is a NEW project or EXISTING project
  // Use operationType as the source of truth - 'initial-build' ALWAYS means new project
  const isNewProject = operationType === 'initial-build';
  let selectedTemplate: Template | null = null;
  let fileTree = '';
  const templateEvents: Array<{type: string; data: Record<string, unknown>}> = [];
  const strategy = await resolveAgentStrategy(agent);
  const strategyContext: AgentStrategyContext = {
    projectId,
    projectName,
    prompt,
    workingDirectory,
    operationType,
    isNewProject,
    workspaceRoot,
  };

  // NEW: Check if frontend provided a template (from analysis endpoint)
  if (providedTemplate) {
    console.log(`[orchestrator] ✅ Frontend provided template: ${providedTemplate.name}`);
    console.log(`[orchestrator]    Template ID: ${providedTemplate.id}`);
    console.log(`[orchestrator]    Framework: ${providedTemplate.framework}`);
    console.log(`[orchestrator]    Repository: ${providedTemplate.repository}`);

    // Find full template object from templates.json
    const allTemplates = await import('./templates/config.js').then(m => m.getAllTemplates?.() || []);
    const fullTemplate = await allTemplates.find((t: Template) => t.id === providedTemplate.id);

    if (fullTemplate) {
      selectedTemplate = fullTemplate;
      console.log(`[orchestrator]    Matched full template from templates.json`);
    } else {
      console.warn(`[orchestrator]    ⚠️ Template ${providedTemplate.id} not found in templates.json, will use metadata`);
      // Even if not found, we can still use the provided metadata
    }
  }

  // Log the determination
  if (isNewProject) {
    console.log(`[orchestrator] NEW PROJECT (operationType: ${operationType})`);
  } else {
    console.log(`[orchestrator] EXISTING PROJECT (operationType: ${operationType})`);
  }

  // Verify directory state for logging
  try {
    if (existsSync(workingDirectory)) {
      const files = await readdir(workingDirectory);
      console.log(`[orchestrator] Directory status: ${files.length} files found`);

      // If initial-build but files exist, we should clean them first
      if (isNewProject && files.length > 0) {
        console.log(`[orchestrator] WARNING: initial-build but directory not empty - will overwrite`);
      }
    } else {
      console.log(`[orchestrator] Directory doesn't exist - will create`);
    }
  } catch (error) {
    console.log(`[orchestrator] Directory check failed:`, error);
  }

  // Handle NEW projects - download template
  const SKIP_TEMPLATES = process.env.SKIP_TEMPLATES === 'true';
  strategyContext.skipTemplates = SKIP_TEMPLATES;

  let templateSelectionContext: string | undefined;

  // NEW: Handle frontend-provided template OR fallback to auto-selection
  if (isNewProject && !SKIP_TEMPLATES) {
    if (providedTemplate) {
      // Frontend provided a template - use it!
      console.log('[orchestrator] 🎯 NEW PROJECT (Frontend-selected template)');

      const shouldDownload = strategy.shouldDownloadTemplate(strategyContext);
      if (shouldDownload) {
        // Claude path: Download the template
        console.log('[orchestrator]    Claude agent: Downloading frontend-selected template...');

        // selectedTemplate should already be set from the earlier block (lines 74-91)
        // But if it's not (template not in templates.json), we need to handle that
        if (!selectedTemplate) {
          console.error('[orchestrator]    ERROR: selectedTemplate is null but shouldDownloadTemplate is true');
          console.error(`[orchestrator]    providedTemplate.id: ${providedTemplate.id}`);
          throw new Error(`Template ${providedTemplate.id} not found in runner's templates.json. Cannot download.`);
        }

        const downloadedPath = await downloadTemplate(selectedTemplate, workingDirectory);
        console.log(`[orchestrator]    Template downloaded to: ${downloadedPath}`);
        fileTree = await getProjectFileTree(downloadedPath);
      } else {
        // Codex path: Don't download, agent will clone it
        console.log('[orchestrator]    Codex agent: Will clone template during execution');
        fileTree = '';

        // Store template metadata in strategy context for Codex prompt
        strategyContext.templateMetadata = {
          id: providedTemplate.id,
          repository: providedTemplate.repository,
          branch: providedTemplate.branch,
        };
      }
    } else {
      // No template provided - use auto-selection
      const shouldDownload = strategy.shouldDownloadTemplate(strategyContext);
      if (!shouldDownload) {
        console.log('[orchestrator] 🤖 NEW PROJECT (Agent-managed template) - Deferring template selection to agent');
        templateSelectionContext = typeof strategy.getTemplateSelectionContext === 'function'
          ? await strategy.getTemplateSelectionContext(strategyContext)
          : await getTemplateSelectionContext();
        if (templateSelectionContext) {
          console.log(`[orchestrator]    Template catalog prepared (${templateSelectionContext.length} chars)`);
        }
        fileTree = '';
      } else {
        console.log('[orchestrator] 🎯 NEW PROJECT (Claude) - Orchestrator downloads template...');

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
    }
  } else {
    console.log('[orchestrator] EXISTING PROJECT - Skipping template download');
    fileTree = await getProjectFileTree(workingDirectory);
  }

  strategyContext.templateSelectionContext = templateSelectionContext;
  strategyContext.fileTree = fileTree;
  strategyContext.templateName = selectedTemplate?.name;
  strategyContext.templateFramework = selectedTemplate?.tech.framework;

  if (selectedTemplate) {
    strategy.postTemplateSelected?.(strategyContext, {
      name: selectedTemplate.name,
      framework: selectedTemplate.tech.framework,
      fileTree,
    });
  }

  // Prepare project metadata (for new projects with templates)
  // NEW: If template was provided by frontend, BOTH agents get metadata immediately
  const projectMetadata = isNewProject && (selectedTemplate || providedTemplate) ? {
    path: workingDirectory,
    projectType: selectedTemplate?.tech.framework ?? providedTemplate?.framework ?? 'unknown',
    runCommand: selectedTemplate?.setup.devCommand ?? providedTemplate?.runCommand ?? 'npm run dev',
    port: selectedTemplate?.setup.defaultPort ?? providedTemplate?.port ?? 3000,
  } : undefined;

  // Generate dynamic system prompt
  console.log(`[orchestrator] ═══════════════════════════════════════════════`);
  console.log(`[orchestrator] GENERATING SYSTEM PROMPT`);
  console.log(`[orchestrator]   isNewProject: ${isNewProject}`);
  console.log(`[orchestrator]   template: ${selectedTemplate?.name || 'none'}`);
  console.log(`[orchestrator]   fileTree length: ${fileTree.length} chars`);
  console.log(`[orchestrator]   hasTemplateCatalog: ${!!templateSelectionContext}`);
  console.log(`[orchestrator] ═══════════════════════════════════════════════`);

  const systemPromptSections = await strategy.buildSystemPromptSections(strategyContext);
  const systemPrompt = systemPromptSections.join('\n\n');

  console.log(`[orchestrator] System prompt generated (${systemPrompt.length} chars)`);
  console.log(`[orchestrator] First 500 chars:\n${systemPrompt.substring(0, 500)}...`);

  // Log template catalog section if present
  if (templateSelectionContext) {
    console.log(`[orchestrator] Template catalog section (${templateSelectionContext.length} chars):`);
    console.log(`[orchestrator] First 1200 chars of catalog:\n${templateSelectionContext.substring(0, 1200)}...`);
  }

  const fullPrompt = await strategy.buildFullPrompt(strategyContext, prompt);

  console.log(`[orchestrator] ═══════════════════════════════════════════════`);
  console.log(`[orchestrator] FINAL ORCHESTRATION RESULT`);
  console.log(`[orchestrator]   isNewProject: ${isNewProject}`);
  console.log(`[orchestrator]   template: ${selectedTemplate?.name || 'none'}`);
  console.log(`[orchestrator]   systemPrompt length: ${systemPrompt.length}`);
  console.log(`[orchestrator]   fullPrompt length: ${fullPrompt.length}`);
  console.log(`[orchestrator]   hasMetadata: ${!!projectMetadata}`);
  console.log(`[orchestrator] ═══════════════════════════════════════════════`);

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
      sections.push(`## Template Selection and Setup

EXACT CLONE COMMANDS (use these exactly as shown):

**For React/Vite projects:**
  npx degit github:codyde/template-reactvite#main "${projectName}"

**For Next.js projects:**
  npx degit github:codyde/template-nextjs15#main "${projectName}"

**For Astro projects:**
  npx degit github:codyde/template-astro#main "${projectName}"

**For React + Node.js:**
  npx degit github:codyde/template-reactnode#main "${projectName}"

Select based on user's request:
- Astro, static, blog, docs, landing page → Use Astro template
- Next.js, full-stack, API, database, auth → Use Next.js template
- React + backend, SPA + API → Use React + Node template
- Simple React app, prototype, basic UI → Use React/Vite template

After cloning:
1. cd ${projectName}
2. Create .npmrc containing:
   enable-modules-dir=true
   shamefully-hoist=false
3. Update package.json "name" field to "${projectName}"
4. Implement the user's request by modifying the template files`);
    } else {
      sections.push(`## Existing Project Context

- Project location: ${projectPath}
- Inspect the current codebase and apply the requested changes without re-scaffolding.`);
    }

    sections.push(`## Workspace Rules
- You are currently in the workspace directory.
- After cloning, all commands should be run from inside the \`${projectName}\` directory.
- Use relative paths from the project root (e.g., \`src/pages/index.astro\`).
- Never use absolute paths.`);

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
