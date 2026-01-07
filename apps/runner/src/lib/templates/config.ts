import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface Template {
  id: string;
  name: string;
  description: string;
  repository: string;
  branch: string;
  selection: {
    keywords: string[];
    useCases: string[];
    examples: string[];
  };
  tech: {
    framework: string;
    version: string;
    language: string;
    styling: string;
    uiLibrary?: string;
    packageManager: string;
    nodeVersion: string;
  };
  setup: {
    defaultPort: number;
    installCommand: string;
    devCommand: string;
    buildCommand: string;
  };
  ai: {
    systemPromptAddition: string;
    includedFeatures: string[];
  };
}

export interface TemplateConfig {
  version: string;
  templates: Template[];
}

let cachedConfig: TemplateConfig | null = null;

/**
 * Get the configured templates path from environment variable
 * This is set by setTemplatesPath() in agent-core
 */
function getTemplatesPath(): string {
  const path = process.env.TEMPLATES_JSON_PATH ?? join(process.cwd(), 'templates.json');
  return path;
}

/**
 * Load template configuration from templates.json
 */
export async function loadTemplateConfig(): Promise<TemplateConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = getTemplatesPath();
  const content = await readFile(configPath, 'utf-8');
  cachedConfig = JSON.parse(content) as TemplateConfig;

  if (process.env.DEBUG_BUILD === '1') console.log(`✅ Loaded ${cachedConfig.templates.length} templates from ${configPath}`);
  return cachedConfig;
}

/**
 * Get template by ID
 */
export async function getTemplateById(id: string): Promise<Template | null> {
  const config = await loadTemplateConfig();
  return config.templates.find(t => t.id === id) ?? null;
}

/**
 * Get all templates
 */
export async function getAllTemplates(): Promise<Template[]> {
  const config = await loadTemplateConfig();
  return config.templates;
}

/**
 * Generate AI context for template selection
 * This is injected into the system prompt
 */
export async function getTemplateSelectionContext(): Promise<string> {
  const templates = await getAllTemplates();

  let context = '🎯 AVAILABLE TEMPLATES:\n\n';

  for (const template of templates) {
    context += `**${template.name}** (ID: ${template.id})\n`;
    context += `${template.description}\n\n`;
    context += `Best for:\n${template.selection.useCases.map(uc => `  • ${uc}`).join('\n')}\n\n`;
    context += `Example user requests:\n${template.selection.examples.map(ex => `  • "${ex}"`).join('\n')}\n\n`;
    context += `Tech Stack: ${template.tech.framework} ${template.tech.version}, ${template.tech.language}, ${template.tech.styling}`;
    if (template.tech.uiLibrary) {
      context += `, ${template.tech.uiLibrary}`;
    }
    context += '\n\n';
    context += '---\n\n';
  }

  return context;
}

/**
 * AI-based template selection from user prompt
 * Scores templates based on keyword matches
 */
export async function selectTemplateFromPrompt(userPrompt: string): Promise<Template> {
  const templates = await getAllTemplates();
  const prompt = userPrompt.toLowerCase();

  // Score each template based on keyword matches
  const scores = templates.map(template => {
    const keywords = template.selection.keywords;
    const matches = keywords.filter(keyword =>
      prompt.includes(keyword.toLowerCase())
    );

    return {
      template,
      score: matches.length,
      matchedKeywords: matches,
    };
  });

  // Sort by score (highest first)
  scores.sort((a, b) => b.score - a.score);

  // Return best match if score > 0
  if (scores[0].score > 0) {
    if (process.env.DEBUG_BUILD === '1') console.log(`🎯 Auto-selected template: ${scores[0].template.name}`);
    if (process.env.DEBUG_BUILD === '1') console.log(`   Matched keywords: ${scores[0].matchedKeywords.join(', ')}`);
    return scores[0].template;
  }

  // Default to React + Vite if no matches (simplest option)
  if (process.env.DEBUG_BUILD === '1') console.log(`🎯 No keyword matches, defaulting to react-vite (basic template)`);
  return templates.find(t => t.id === 'react-vite') ?? templates[0];
}
