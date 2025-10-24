import type { AgentStrategy, AgentStrategyContext } from './strategy';
import { MOOD_GUIDANCE } from '../../types/design';
import { resolveTags, generatePromptFromTags } from '../tags/resolver';

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

  // Use tag-based configuration if available, otherwise fall back to designPreferences
  if (context.tags && context.tags.length > 0) {
    const resolved = resolveTags(context.tags);
    const tagPrompt = generatePromptFromTags(resolved, context.projectName);
    if (tagPrompt) {
      sections.push(tagPrompt);
    }
  } else if (context.designPreferences) {
    const prefs = context.designPreferences;
    const moodGuidance = prefs.mood
      .map(m => `- ${m}: ${MOOD_GUIDANCE[m] || ''}`)
      .join('\n');

    sections.push(`## Design Constraints (User-Specified)

CRITICAL: The user has specified EXACT design preferences. Follow these specifications precisely:

**Color Palette (MANDATORY - DO NOT DEVIATE):**
- Primary: ${prefs.colors.primary} (use for CTAs, primary buttons, brand elements)
- Secondary: ${prefs.colors.secondary} (use for secondary actions, supporting elements)
- Accent: ${prefs.colors.accent} (use for highlights, badges, important elements)
- Neutral Light: ${prefs.colors.neutralLight} (use for light backgrounds, cards, containers)
- Neutral Dark: ${prefs.colors.neutralDark} (use for text, dark backgrounds, borders)

You MUST use ONLY these colors. Define them as CSS custom properties in your design system:

\`\`\`css
:root {
  --color-primary: ${prefs.colors.primary};
  --color-secondary: ${prefs.colors.secondary};
  --color-accent: ${prefs.colors.accent};
  --color-neutral-light: ${prefs.colors.neutralLight};
  --color-neutral-dark: ${prefs.colors.neutralDark};
}
\`\`\`

**Typography (MANDATORY):**
- Heading Font: ${prefs.typography.heading} (use for all h1, h2, h3, h4, h5, h6)
- Body Font: ${prefs.typography.body} (use for paragraphs, labels, body text, UI elements)

Import these fonts from Google Fonts or use system fonts as specified.

**Style Direction:**
The user wants a design that feels: ${prefs.mood.join(', ')}

Interpret these mood descriptors to guide your design decisions:
${moodGuidance}

**Critical Reminders:**
- Do NOT add any colors outside the specified 5-color palette
- Do NOT use any fonts other than the 2 specified
- Match the mood descriptors in your typography scale, spacing, and component design
- Define colors as CSS variables, never use hex values directly in components`);
  }
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
