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

CRITICAL INSTRUCTIONS:
You will complete this ENTIRE request in ONE continuous session.
Do NOT stop after calling MCP tools or outputting a task list.
You must execute EVERY step from start to finish before completing.

Each bash command runs in a fresh shell - prefix EVERY command with "cd ${context.projectName} &&" after cloning.

REQUIRED EXECUTION (complete ALL steps):

STEP 0 - Initialize Task Tracking:
   Call: todo-list-tool (SentryVibe MCP server)
   Input: Break down "${basePrompt}" into 4-8 specific implementation tasks
   This returns a structured todo list - use it to guide your work

STEP 1 - Clone and Configure:
   bash -lc 'npx degit ${repository}#${branch} ${context.projectName}'
   bash -lc 'ls ${context.projectName}'
   bash -lc 'cd ${context.projectName} && cat > .npmrc << EOF
save-exact=true
legacy-peer-deps=false
engine-strict=true
EOF'
   bash -lc 'cd ${context.projectName} && npm pkg set name="${context.projectName}"'

STEP 2 - Install Dependencies:
   bash -lc 'cd ${context.projectName} && npm install'
   Call: todo-update-tool to mark setup tasks complete

STEP 3 - Implement Features:
   - Modify template files to deliver requested functionality
   - Use: bash -lc 'cd ${context.projectName} && cat > filepath << EOF\n...\nEOF'
   - Call todo-update-tool after each major feature
   - Implement ALL requested features completely

STEP 4 - Verify:
   bash -lc 'cd ${context.projectName} && npm run build'
   Call: todo-update-tool to mark all tasks complete

You MUST complete ALL steps (0-4) in this single session.
Only respond "Implementation complete" after you have executed ALL steps and verified the build.`;
  }

  // Fallback: Template not pre-selected - use MCP for selection
  return `USER REQUEST: ${basePrompt}

CRITICAL INSTRUCTIONS:
You will complete this ENTIRE request in ONE continuous session.
Do NOT stop after calling MCP tools or outputting a task list.
You must execute EVERY step from start to finish before completing.

Each bash command runs in a fresh shell - prefix EVERY command with "cd ${context.projectName} &&" after cloning.

REQUIRED EXECUTION (complete ALL steps):

STEP 0A - Select Template (if needed):
   Call: template-selection (SentryVibe MCP server)
   Input: {"applicationDescription": "${basePrompt}"}
   This returns: templateId, repository, degitCommand
   Use the degitCommand to clone

STEP 0B - Initialize Task Tracking:
   Call: todo-list-tool (SentryVibe MCP server)
   Input: {"tasks": [list of 4-8 implementation tasks you'll do]}
   This returns a structured todo list - use it to guide your work

STEP 1 - Clone and Configure:
   Use degitCommand from template-selection OR catalog
   bash -lc 'ls ${context.projectName}'
   bash -lc 'cd ${context.projectName} && cat > .npmrc << EOF\nsave-exact=true\nEOF'
   bash -lc 'cd ${context.projectName} && npm pkg set name="${context.projectName}"'

STEP 2 - Install Dependencies:
   bash -lc 'cd ${context.projectName} && npm install'
   Call: todo-update-tool with setup tasks marked complete

STEP 3 - Implement Features:
   - Modify template files to deliver requested functionality
   - ALL commands: bash -lc 'cd ${context.projectName} && ...'
   - Call todo-update-tool after each major feature
   - Implement ALL requested features completely

STEP 4 - Verify:
   bash -lc 'cd ${context.projectName} && npm run build'
   Call: todo-update-tool to mark all tasks complete

You MUST complete ALL steps (0-4) in this single session.
Only respond "Implementation complete" after you have executed ALL steps and verified the build.`;
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
