/**
 * Type definitions for template configuration (SAFE FOR CLIENT)
 * All actual loading logic is in config.server.ts
 */

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

/**
 * Lazy-load server-side template functions
 * This prevents fs/promises from being bundled in client code
 */
async function getServerLoader() {
  if (typeof window !== 'undefined') {
    throw new Error('Template config loading is server-side only');
  }

  // Dynamic import to avoid bundling fs/promises in client
  const serverModule = await import('./config.server');
  return serverModule;
}

/**
 * Load template configuration from templates.json (SERVER-ONLY)
 */
export async function loadTemplateConfig(): Promise<TemplateConfig> {
  const loader = await getServerLoader();
  return loader.loadTemplateConfig();
}

/**
 * Get template by ID (SERVER-ONLY)
 */
export async function getTemplateById(id: string): Promise<Template | null> {
  const loader = await getServerLoader();
  return loader.getTemplateById(id);
}

/**
 * Get all templates (SERVER-ONLY)
 */
export async function getAllTemplates(): Promise<Template[]> {
  const loader = await getServerLoader();
  return loader.getAllTemplates();
}

/**
 * Generate AI context for template selection (SERVER-ONLY)
 */
export async function getTemplateSelectionContext(): Promise<string> {
  const loader = await getServerLoader();
  return loader.getTemplateSelectionContext();
}

/**
 * AI-based template selection from user prompt (SERVER-ONLY)
 */
export async function selectTemplateFromPrompt(userPrompt: string): Promise<Template> {
  const loader = await getServerLoader();
  return loader.selectTemplateFromPrompt(userPrompt);
}
