import type { AgentStrategy, AgentStrategyContext } from './strategy';

function buildClaudeSections(context: AgentStrategyContext): string[] {
  const sections: string[] = [];

  if (context.isNewProject) {
    sections.push(`## New Project: Template Prepared

- Project name: ${context.projectName}
- Location: ${context.workingDirectory}
- Operation type: ${context.operationType}

The template has already been downloaded. Install dependencies and customize the scaffold to satisfy the request.`);
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

  return sections;
}

function buildFullPrompt(context: AgentStrategyContext, basePrompt: string): string {
  if (!context.isNewProject) {
    return basePrompt;
  }
  return `${basePrompt}

CRITICAL: The template has already been prepared in ${context.workingDirectory}. Do not scaffold a new project.`;
}

const claudeStrategy: AgentStrategy = {
  buildSystemPromptSections: buildClaudeSections,
  buildFullPrompt,
  shouldDownloadTemplate(context) {
    return context.isNewProject && !context.skipTemplates;
  },
  postTemplateSelected(context, template) {
    context.templateName = template.name;
    context.templateFramework = template.framework;
    context.fileTree = template.fileTree;
  },
};

export default claudeStrategy;
