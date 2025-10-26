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

  sections.push(`## Quality Expectations
- Narrate key steps in the chat stream.
- Include the mandatory todo list JSON in every response.`);

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

CRITICAL: Each bash command runs in a fresh shell. You CANNOT cd once and expect it to persist. Instead, prefix EVERY command with "cd ${context.projectName} &&" after cloning.

SETUP STEPS (complete in order):
1. Clone the template:
   bash -lc 'npx degit ${repository}#${branch} ${context.projectName}'

2. Verify the clone succeeded:
   bash -lc 'ls ${context.projectName}'

3. Create .npmrc with required settings:
   bash -lc 'cd ${context.projectName} && cat > .npmrc << EOF
save-exact=true
legacy-peer-deps=false
engine-strict=true
EOF'

4. Update package.json name field:
   bash -lc 'cd ${context.projectName} && npm pkg set name="${context.projectName}"'

IMPLEMENTATION STEPS:
- ALL file operations and commands MUST include the project directory path
- Use "cd ${context.projectName} &&" prefix for every bash command
- Examples:
  * Read: bash -lc 'cd ${context.projectName} && cat src/App.tsx'
  * Edit: bash -lc 'cd ${context.projectName} && cat > src/App.tsx << EOF\n...\nEOF'
  * Install: bash -lc 'cd ${context.projectName} && npm install'
  * Build: bash -lc 'cd ${context.projectName} && npm run build'
- Modify template files to deliver the requested MVP
- Confirm the core flow works end-to-end

COMPLETION SIGNAL:
When the MVP is finished, respond with "Implementation complete" plus a brief summary.`;
  }

  // Fallback: Old catalog-based selection (backward compatibility)
  return `USER REQUEST: ${basePrompt}

CRITICAL: Each bash command runs in a fresh shell. You CANNOT cd once and expect it to persist. Instead, prefix EVERY command with "cd ${context.projectName} &&" after cloning.

SETUP STEPS (complete in order):
1. Clone the chosen template (see catalog for commands)
2. Verify the clone succeeded: bash -lc 'ls ${context.projectName}'
3. Create .npmrc: bash -lc 'cd ${context.projectName} && cat > .npmrc << EOF\nsave-exact=true\nEOF'
4. Update package.json: bash -lc 'cd ${context.projectName} && npm pkg set name="${context.projectName}"'

IMPLEMENTATION STEPS:
- ALL commands MUST include "cd ${context.projectName} &&" prefix
- Modify template files to deliver the requested MVP
- Install dependencies as needed
- Confirm the core flow works end-to-end

COMPLETION SIGNAL:
When the MVP is finished, respond with "Implementation complete" plus a brief summary.`;
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
