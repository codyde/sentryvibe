import type { AgentStrategy, AgentStrategyContext } from './strategy';
import { processCodexEvent } from './codex/events';
import type { CodexSessionState } from '@/types/generation';

function buildCodexSections(context: AgentStrategyContext): string[] {
  const sections: string[] = [];

  if (context.isNewProject) {
    // UNIFIED: Template is always pre-downloaded like Claude
    sections.push(`## New Project: Template Prepared

- Project name: ${context.projectName}
- Location: ${context.workingDirectory}
- Operation type: ${context.operationType}

The template has already been downloaded and is ready in your workspace. Install dependencies and customize the scaffold to satisfy the request.`);
  } else {
    sections.push(`## Existing Project Context

- Project location: ${context.workingDirectory}
- Operation type: ${context.operationType}

Review the current codebase and apply the requested changes without re-scaffolding.`);
  }

  sections.push(`## Workspace Rules
- Use relative paths within the project.
- Work inside the existing project structure.
- Provide complete updates without placeholders.`);

  if (context.fileTree) {
    sections.push(`## Project Structure Snapshot
${context.fileTree}`);
  }

  if (context.templateName) {
    sections.push(`## Template Details
- Template: ${context.templateName}
- Framework: ${context.templateFramework ?? 'unknown'}`);
  }

  sections.push(`## Quality Expectations
- Narrate key steps in the chat stream.
- Include the mandatory todo list JSON in every response.`);

  return sections;
}

function buildFullPrompt(context: AgentStrategyContext, basePrompt: string): string {
  if (!context.isNewProject) {
    return basePrompt;
  }

  // UNIFIED: Template is pre-downloaded like Claude
  return `${basePrompt}

CRITICAL: The template has already been prepared in ${context.workingDirectory}. Do not scaffold a new project or clone templates.

IMPLEMENTATION STEPS:
1. Review the existing template structure
2. Install dependencies (npm install or pnpm install)
3. Modify template files to deliver the requested MVP
4. Test that the dev server starts successfully
5. Confirm the core flow works end-to-end

COMPLETION SIGNAL:
When the MVP is finished, respond with "Implementation complete" plus a brief summary.`;
}

const codexStrategy: AgentStrategy = {
  buildSystemPromptSections: buildCodexSections,
  buildFullPrompt,
  shouldDownloadTemplate(context) {
    // UNIFIED: Download templates upfront like Claude (faster, more reliable)
    return context.isNewProject && !context.skipTemplates;
  },
  postTemplateSelected(context, template) {
    // Store template info after download (matching Claude behavior)
    context.templateName = template.name;
    context.templateFramework = template.framework;
    context.fileTree = template.fileTree;
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
