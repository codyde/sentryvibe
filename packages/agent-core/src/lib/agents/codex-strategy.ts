import { buildCodexTemplateCatalogSection } from './codex/template-catalog';
import type { AgentStrategy, AgentStrategyContext } from './strategy';
import { processCodexEvent } from './codex/events';

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
    sections.push(`## Template Selection and Setup

- Codex selects the appropriate template using the provided catalog.
- After cloning, run all commands from inside the ${context.projectName} directory.
- Follow the setup instructions exactly before implementing the request.`);
  } else {
    sections.push(`## Existing Project Context

- Project location: ${context.workingDirectory}
- Modify the existing codebase to satisfy the request.`);
  }

  sections.push(`## Workspace Rules
- Operate inside the workspace directory.
- Use relative paths only.
- Provide complete file contents for every modification.`);

  sections.push(`## Quality Expectations
- Narrate key steps in the chat stream.
- Include the mandatory todo list JSON in every response.`);

  if (context.templateSelectionContext) {
    sections.push(buildCodexTemplateCatalogSection(context.templateSelectionContext));
  }

  return sections;
}

function buildFullPrompt(context: AgentStrategyContext, basePrompt: string): string {
  if (!context.isNewProject) {
    return basePrompt;
  }

  return `USER REQUEST: ${basePrompt}

SETUP STEPS (complete before implementation):
1. Clone the chosen template (see catalog for commands).
2. cd ${context.projectName}
3. Create .npmrc with required settings.
4. Update package.json "name" field to "${context.projectName}".

IMPLEMENTATION STEPS:
- Modify template files to deliver the requested MVP.
- Install dependencies as needed.
- Confirm the core flow works end-to-end.

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
    if (context.templateSelectionContext) {
      return context.templateSelectionContext;
    }
    const catalog = await import('../../templates/config.js').then(mod => mod.getTemplateSelectionContext());
    return catalog;
  },
  processRunnerEvent(state, event) {
    return processCodexEvent(state, event);
  },
};

export default codexStrategy;
