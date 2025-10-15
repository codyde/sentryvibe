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
 * Load template configuration from templates.json
 */
export declare function loadTemplateConfig(): Promise<TemplateConfig>;
/**
 * Get template by ID
 */
export declare function getTemplateById(id: string): Promise<Template | null>;
/**
 * Get all templates
 */
export declare function getAllTemplates(): Promise<Template[]>;
/**
 * Generate AI context for template selection
 * This is injected into the system prompt
 */
export declare function getTemplateSelectionContext(): Promise<string>;
/**
 * AI-based template selection from user prompt
 * Scores templates based on keyword matches
 */
export declare function selectTemplateFromPrompt(userPrompt: string): Promise<Template>;
