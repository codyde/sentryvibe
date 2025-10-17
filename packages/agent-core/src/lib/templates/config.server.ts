import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Template, TemplateConfig } from './config';

let cachedConfig: TemplateConfig | null = null;
let configuredPath: string | undefined;

/**
 * Configure the path to templates.json
 * Call this before using any template functions
 */
export function setTemplatesPath(path: string): void {
  configuredPath = path;
  cachedConfig = null; // Clear cache when path changes
}

/**
 * Load template configuration from templates.json (SERVER-ONLY)
 */
export async function loadTemplateConfig(): Promise<TemplateConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Use configured path, or fall back to process.cwd()
  const configPath = configuredPath ?? join(process.cwd(), 'templates.json');
  const content = await readFile(configPath, 'utf-8');
  cachedConfig = JSON.parse(content) as TemplateConfig;

  console.log(`✅ Loaded ${cachedConfig.templates.length} templates from ${configPath}`);
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
    context += `📦 Clone command:\n`;
    context += `  npx degit ${template.repository}#${template.branch} "<project-name>"\n\n`;
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
    console.log(`🎯 Auto-selected template: ${scores[0].template.name}`);
    console.log(`   Matched keywords: ${scores[0].matchedKeywords.join(', ')}`);
    return scores[0].template;
  }

  // Default to React + Vite if no matches (simplest option)
  console.log(`🎯 No keyword matches, defaulting to react-vite (basic template)`);
  return templates.find(t => t.id === 'react-vite') ?? templates[0];
}
