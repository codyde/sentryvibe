import { buildCodexTemplateCatalogSection } from './codex/template-catalog';
import type { AgentStrategy, AgentStrategyContext } from './strategy';
import { processCodexEvent } from './codex/events';
import type { CodexSessionState } from '@/types/generation';
import { loadTemplateSelectionContext } from '../templates/load-template-context';
import { resolveTags, generatePromptFromTags } from '../tags/resolver';

function getParentDirectory(filePath: string): string {
  if (!filePath) return filePath;
  const normalized = filePath.replace(/\\/g, '/');
  const trimmed = normalized.replace(/\/+$|\/+$|\/*$/, '');
  const lastSlash = trimmed.lastIndexOf('/');
  if (lastSlash <= 0) {
    return '/';
  }
  return trimmed.slice(0, lastSlash);
}

function buildCodexSections(context: AgentStrategyContext): string[] {
  const sections: string[] = [];

  if (context.isNewProject) {
    // NEW: Check if template was pre-selected by frontend
    if (context.templateMetadata) {
      sections.push(`## Template Already Selected

- Template: ${context.templateName ?? 'Selected template'}
- Repository: ${context.templateMetadata.repository}#${context.templateMetadata.branch}
- The template has been chosen based on your analysis of the user's request
- Clone command: npx degit ${context.templateMetadata.repository}#${context.templateMetadata.branch} ${context.projectName}
- CRITICAL: After cloning, prefix EVERY bash command with "cd ${context.projectName} &&"
- Follow the setup instructions exactly before implementing the request`);
    } else {
      sections.push(`## Template Selection and Setup

- Codex selects the appropriate template using the provided catalog
- After cloning, prefix EVERY bash command with "cd ${context.projectName} &&"
- Remember: bash commands run in fresh shells - cd does not persist
- Follow the setup instructions exactly before implementing the request`);
    }
  } else {
    sections.push(`## Existing Project Context

- Project location: ${context.workingDirectory}
- Modify the existing codebase to satisfy the request.`);
  }

  sections.push(`## Workspace Rules
- ${context.isNewProject ? `After cloning, prefix ALL bash commands with "cd ${context.projectName} &&"` : 'Operate inside the workspace directory'}
- Each bash command runs in a fresh shell - cd does not persist between commands
- ${context.isNewProject ? `Example: bash -lc 'cd ${context.projectName} && npm install'` : 'Use relative paths for file operations'}
- Provide complete file contents for every modification`);

  sections.push(`## Available MCP Tools (SentryVibe Server)

You have access to structured tools via the SentryVibe MCP server:

1. **template-selection** - Select best template for the request
   Input: {"applicationDescription": "description"}
   Returns: template info with degitCommand

2. **todo-list-tool** - Create structured task breakdown
   Input: {"tasks": ["task 1", "task 2", ...]}
   Returns: Formatted todos with status tracking

3. **todo-update-tool** - Update task status as you progress
   Input: {"todos": [{content, status, activeForm}]}
   Returns: Validated updated todos

USE THESE TOOLS to create and maintain your task breakdown.
They provide structured output that the system can track.`);

  // Add tag-based configuration (same as claude-strategy)
  if (context.tags && context.tags.length > 0) {
    const resolved = resolveTags(context.tags);
    const tagPrompt = generatePromptFromTags(resolved, context.projectName);
    if (tagPrompt) {
      sections.push(tagPrompt);
    }
  }

  // NEW: Only include template catalog if template wasn't pre-selected
  if (context.templateSelectionContext && !context.templateMetadata) {
    sections.push(buildCodexTemplateCatalogSection(context.templateSelectionContext));
  }

  return sections;
}

function buildFullPrompt(context: AgentStrategyContext, basePrompt: string): string {
  if (!context.isNewProject) {
    return basePrompt;
  }

  // NEW: If template was pre-selected by frontend, provide specific clone command
  if (context.templateMetadata) {
    const { repository, branch } = context.templateMetadata;
    return `USER REQUEST: ${basePrompt}

WORKFLOW INSTRUCTIONS:

You will complete this request in ONE continuous session by following these exact steps:

STEP 1: CREATE TASK BREAKDOWN
First, analyze the request and determine what specific tasks need to be done to complete it.

Create AS MANY TASKS AS NEEDED to properly build the MVP. This could be:
- Simple request: 3-4 tasks
- Medium request: 5-8 tasks
- Complex request: 10-15+ tasks

Think through ALL the work required, then build your task list.
Example format: ["Clone template", "Install deps", "Task 1", "Task 2", ..., "Verify build"]

Then call the MCP tool:
   todo-list-tool with input: {"tasks": ["task 1", "task 2", ...as many as needed]}

This tool will return a structured todo list. USE this output to guide your work through the remaining steps.

STEP 2: CLONE AND CONFIGURE
   bash -lc 'npx degit ${repository}#${branch} ${context.projectName}'
   bash -lc 'ls ${context.projectName}'
   bash -lc 'cd ${context.projectName} && cat > .npmrc << EOF
save-exact=true
legacy-peer-deps=false
engine-strict=true
EOF'
   bash -lc 'cd ${context.projectName} && npm pkg set name="${context.projectName}"'

After completing setup, call:
   todo-update-tool with updated todo list (mark setup tasks as "completed")

STEP 3: INSTALL DEPENDENCIES
   bash -lc 'cd ${context.projectName} && npm install'

After installing, call:
   todo-update-tool with updated status

STEP 4: IMPLEMENT ALL FEATURES
   - Modify template files to deliver the requested functionality
   - Use: bash -lc 'cd ${context.projectName} && cat > filepath << EOF\n...\nEOF'
   - Implement EVERY requested feature completely
   - Each time you complete a major feature, call todo-update-tool

STEP 5: VERIFY BUILD
   bash -lc 'cd ${context.projectName} && npm run build'

After successful build, call:
   todo-update-tool with all tasks marked "completed"

CRITICAL: You MUST complete ALL 5 steps in this single session.
Each bash command runs in a fresh shell - prefix with "cd ${context.projectName} &&"
Only respond "Implementation complete" after ALL steps are verified.`;
  }

  // Fallback: Template not pre-selected - use MCP for selection
  return `USER REQUEST: ${basePrompt}

WORKFLOW INSTRUCTIONS:

You will complete this request in ONE continuous session by following these exact steps:

STEP 1: SELECT TEMPLATE
Call the MCP tool:
   template-selection with input: {"applicationDescription": "${basePrompt}"}

This tool analyzes the request and returns the best template with:
- templateId, templateName
- repository, degitCommand
- confidence, rationale

USE the degitCommand it provides to clone the template.

STEP 2: CREATE TASK BREAKDOWN
Analyze the request and determine what specific tasks need to be done.

Create AS MANY TASKS AS NEEDED to properly build the MVP. This could be:
- Simple request: 3-4 tasks
- Medium request: 5-8 tasks
- Complex request: 10-15+ tasks

Think through ALL the work required, then build your task list.
Example format: ["Clone template", "Install deps", "Task 1", "Task 2", ..., "Verify build"]

Then call the MCP tool:
   todo-list-tool with input: {"tasks": ["task 1", "task 2", ...as many as needed]}

This tool returns a structured todo list. USE this output to guide your work.

STEP 3: CLONE AND CONFIGURE
   Execute the degitCommand from template-selection
   bash -lc 'ls ${context.projectName}'
   bash -lc 'cd ${context.projectName} && cat > .npmrc << EOF\nsave-exact=true\nEOF'
   bash -lc 'cd ${context.projectName} && npm pkg set name="${context.projectName}"'

After setup, call:
   todo-update-tool with updated todo list (mark setup as "completed")

STEP 4: INSTALL DEPENDENCIES
   bash -lc 'cd ${context.projectName} && npm install'

After installing, call:
   todo-update-tool with updated status

STEP 5: IMPLEMENT ALL FEATURES
   - Modify template files to deliver the requested functionality
   - ALL commands: bash -lc 'cd ${context.projectName} && ...'
   - Implement EVERY requested feature completely
   - Each time you complete a major feature, call todo-update-tool

STEP 6: VERIFY BUILD
   bash -lc 'cd ${context.projectName} && npm run build'

After successful build, call:
   todo-update-tool with all tasks marked "completed"

CRITICAL: Complete ALL 6 steps in this single session.
Each bash command runs in a fresh shell - prefix with "cd ${context.projectName} &&"
Only respond "Implementation complete" after ALL steps are verified.`;
}

const codexStrategy: AgentStrategy = {
  buildSystemPromptSections: buildCodexSections,
  buildFullPrompt,
  shouldDownloadTemplate() {
    return false;
  },
  resolveWorkingDirectory(context) {
    if (!context.isNewProject) {
      return context.workingDirectory;
    }
    return getParentDirectory(context.workingDirectory);
  },
  async getTemplateSelectionContext(context) {
    return loadTemplateSelectionContext(context);
  },
  processRunnerEvent<State>(state: State, event) {
    if (!state || typeof state !== 'object') {
      return state;
    }

    const codexLike = state as unknown as CodexSessionState;
    if (!Array.isArray(codexLike?.phases)) {
      return state;
    }

    const next = processCodexEvent(codexLike, event);
    return next as unknown as State;
  },
};

export default codexStrategy;
