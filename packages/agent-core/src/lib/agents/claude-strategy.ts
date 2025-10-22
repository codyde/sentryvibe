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

  sections.push(`## Debugging Tools Available

**Read Console Logs:**
When the dev server encounters errors (during \`npm install\`, \`npm run dev\`, etc.), you can read the console output using Bash:

\`\`\`bash
curl "http://localhost:3000/api/projects/${context.projectId}/logs?level=error&limit=50"
\`\`\`

**Query Parameters:**
- \`level\`: Filter by log level (\`error\`, \`warn\`, or \`all\`)
- \`limit\`: Last N lines (default: all)
- \`search\`: Filter by keyword (e.g., \`search=ENOENT\`)

**Example use cases:**
- After \`npm install\` fails: Read error logs to see missing peer dependencies
- After dev server crashes: Read logs to see startup errors
- When build fails: Search for specific error messages

The logs show stdout and stderr from your commands, helping you diagnose and fix issues immediately.`);

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
