"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadTemplateConfig = loadTemplateConfig;
exports.getTemplateById = getTemplateById;
exports.getAllTemplates = getAllTemplates;
exports.getTemplateSelectionContext = getTemplateSelectionContext;
exports.selectTemplateFromPrompt = selectTemplateFromPrompt;
const promises_1 = require("fs/promises");
const path_1 = require("path");
let cachedConfig = null;
/**
 * Load template configuration from templates.json
 */
async function loadTemplateConfig() {
    if (cachedConfig) {
        return cachedConfig;
    }
    const configPath = (0, path_1.join)(process.cwd(), 'templates.json');
    const content = await (0, promises_1.readFile)(configPath, 'utf-8');
    cachedConfig = JSON.parse(content);
    console.log(`✅ Loaded ${cachedConfig.templates.length} templates from config`);
    return cachedConfig;
}
/**
 * Get template by ID
 */
async function getTemplateById(id) {
    const config = await loadTemplateConfig();
    return config.templates.find(t => t.id === id) ?? null;
}
/**
 * Get all templates
 */
async function getAllTemplates() {
    const config = await loadTemplateConfig();
    return config.templates;
}
/**
 * Generate AI context for template selection
 * This is injected into the system prompt
 */
async function getTemplateSelectionContext() {
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
async function selectTemplateFromPrompt(userPrompt) {
    const templates = await getAllTemplates();
    const prompt = userPrompt.toLowerCase();
    // Score each template based on keyword matches
    const scores = templates.map(template => {
        const keywords = template.selection.keywords;
        const matches = keywords.filter(keyword => prompt.includes(keyword.toLowerCase()));
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
