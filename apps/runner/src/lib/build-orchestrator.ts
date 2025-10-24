/**
 * Build Orchestrator - Handles complete build workflow
 * This replicates the functionality from the old /api/projects/[id]/generate route
 */

import { existsSync } from 'fs';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { selectTemplateFromPrompt, type Template } from './templates/config.js';
import { downloadTemplate, getProjectFileTree } from './templates/downloader.js';
import { getWorkspaceRoot } from './workspace.js';
import { type AgentId } from '@sentryvibe/agent-core/types/agent';
import { resolveAgentStrategy, type AgentStrategyContext } from '@sentryvibe/agent-core/lib/agents';
import { buildLogger } from '@sentryvibe/agent-core/lib/logging/build-logger';
import type { DesignPreferences } from '@sentryvibe/agent-core/types/design';
import type { AppliedTag } from '@sentryvibe/agent-core/types/tags';

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
  designPreferences?: DesignPreferences; // User-specified design constraints (deprecated - use tags)
  tags?: AppliedTag[]; // Tag-based configuration system
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
  const { projectId, projectName, prompt, workingDirectory, agent, operationType, template: providedTemplate, designPreferences, tags } = context;
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
    designPreferences, // Pass through to strategy (deprecated - use tags)
    tags, // Tag-based configuration
  };

  // PRIORITY: Check if tags specify a framework - if so, enforce it (tags override everything)
  if (tags && tags.length > 0) {
    const frameworkTag = tags.find(t => t.key === 'framework');
    if (frameworkTag) {
      buildLogger.log('info', 'orchestrator', `✓ Framework enforced from tags: ${frameworkTag.value}`);

      // Load all templates and filter to only those matching the framework
      const { getAllTemplates } = await import('./templates/config.js');
      const allTemplates = (await getAllTemplates?.()) || [];
      const matchingTemplate = allTemplates.find((t: Template) =>
        t.tech.framework.toLowerCase() === frameworkTag.value.toLowerCase()
      );

      if (matchingTemplate) {
        selectedTemplate = matchingTemplate;
        buildLogger.orchestrator.templateSelected(matchingTemplate.name, matchingTemplate.id);
      } else {
        throw new Error(`No template found for framework: ${frameworkTag.value}. Available templates must match the tag selection.`);
      }
    }
  }

  // If no framework tag, check if frontend provided a template (from analysis endpoint)
  if (!selectedTemplate && providedTemplate) {
    buildLogger.orchestrator.templateProvided(
      providedTemplate.name,
      providedTemplate.id,
      providedTemplate.framework
    );

    // Find full template object from templates.json
    const { getAllTemplates } = await import('./templates/config.js');
    const allTemplates = (await getAllTemplates?.()) || [];
    const fullTemplate = allTemplates.find((t: Template) => t.id === providedTemplate.id);

    if (fullTemplate) {
      selectedTemplate = fullTemplate;
      buildLogger.orchestrator.templateSelected(fullTemplate.name, fullTemplate.id);
    } else {
      buildLogger.orchestrator.error(
        `Template ${providedTemplate.id} not found in templates.json, will use metadata`,
        new Error('Template not in templates.json')
      );
      // Even if not found, we can still use the provided metadata
    }
  }

  // Log the determination
  if (isNewProject) {
    buildLogger.orchestrator.newProject(operationType);
  } else {
    buildLogger.orchestrator.existingProject(operationType);
  }

  // Verify directory state for logging
  try {
    if (existsSync(workingDirectory)) {
      const files = await readdir(workingDirectory);
      if (process.env.DEBUG_BUILD === '1') console.log(`[orchestrator] Directory status: ${files.length} files found`);

      // If initial-build but files exist, we should clean them first
      if (isNewProject && files.length > 0) {
        if (process.env.DEBUG_BUILD === '1') console.log(`[orchestrator] WARNING: initial-build but directory not empty - will overwrite`);
      }
    } else {
      if (process.env.DEBUG_BUILD === '1') console.log(`[orchestrator] Directory doesn't exist - will create`);
    }
  } catch (error) {
    if (process.env.DEBUG_BUILD === '1') console.log(`[orchestrator] Directory check failed:`, error);
  }

  // Handle NEW projects - download template
  const SKIP_TEMPLATES = process.env.SKIP_TEMPLATES === 'true';
  strategyContext.skipTemplates = SKIP_TEMPLATES;

  // UNIFIED: Handle template download for both agents (simplified logic)
  if (isNewProject && !SKIP_TEMPLATES) {
    if (providedTemplate) {
      // Frontend provided a template - use it for both agents
      buildLogger.orchestrator.templateSelecting('auto');

      if (!selectedTemplate) {
        buildLogger.orchestrator.error(
          `selectedTemplate is null for ${providedTemplate.id}`,
          new Error('Template not found in templates.json')
        );
        throw new Error(`Template ${providedTemplate.id} not found in runner's templates.json. Cannot download.`);
      }

      buildLogger.log('info', 'orchestrator', `UNIFIED: Downloading frontend-selected template for ${agent}...`);
      buildLogger.orchestrator.templateDownloading(
        selectedTemplate.name,
        selectedTemplate.repository,
        workingDirectory
      );

      const downloadedPath = await downloadTemplate(selectedTemplate, workingDirectory);
      fileTree = await getProjectFileTree(downloadedPath);

      buildLogger.orchestrator.templateDownloaded(
        selectedTemplate.name,
        downloadedPath,
        fileTree.length
      );

      // Emit template-selected event for UI
      templateEvents.push({
        type: 'template-selected',
        data: {
          templateId: providedTemplate.id,
          templateName: providedTemplate.name,
          framework: providedTemplate.framework,
          repository: providedTemplate.repository,
          selectedBy: 'frontend-analysis',
        },
      });
    } else {
      // No template provided - auto-select and download for both agents
      buildLogger.log('info', 'orchestrator', `UNIFIED: Auto-selecting and downloading template for ${agent}...`);

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
      selectedTemplate = await selectTemplateFromPrompt(prompt);
      buildLogger.orchestrator.templateSelected(selectedTemplate.name, selectedTemplate.id);

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

      buildLogger.orchestrator.templateDownloading(
        selectedTemplate.name,
        selectedTemplate.repository,
        workingDirectory
      );

      const downloadedPath = await downloadTemplate(selectedTemplate, workingDirectory);
      fileTree = await getProjectFileTree(downloadedPath);

      buildLogger.orchestrator.templateDownloaded(
        selectedTemplate.name,
        downloadedPath,
        fileTree.length
      );

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
    }
  } else {
    buildLogger.log('info', 'orchestrator', 'EXISTING PROJECT - Skipping template download');
    fileTree = await getProjectFileTree(workingDirectory);
  }

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
  buildLogger.log('info', 'orchestrator', 'GENERATING SYSTEM PROMPT', {
    isNewProject,
    template: selectedTemplate?.name || 'none',
    fileTreeSize: fileTree.length,
  });

  const systemPromptSections = await strategy.buildSystemPromptSections(strategyContext);
  const systemPrompt = systemPromptSections.join('\n\n');

  buildLogger.orchestrator.systemPromptGenerated(systemPrompt.length);

  const fullPrompt = await strategy.buildFullPrompt(strategyContext, prompt);

  buildLogger.orchestrator.orchestrationComplete({
    isNewProject,
    hasTemplate: !!selectedTemplate,
    hasMetadata: !!projectMetadata
  });

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
