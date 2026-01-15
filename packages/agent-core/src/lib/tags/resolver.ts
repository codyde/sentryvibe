/**
 * Tag Resolution Logic
 *
 * Handles resolving tags, including brand expansion
 */

import { AppliedTag, ResolvedTags } from '../../types/tags';
import { findTagDefinition } from '../../config/tags';

/**
 * Resolve applied tags into final values
 *
 * Logic:
 * 1. Brand tags expand into multiple color values
 * 2. Non-design tags pass through directly
 */
export function resolveTags(appliedTags: AppliedTag[]): ResolvedTags {
  const resolved: ResolvedTags = {};

  try {
    if (!appliedTags || !Array.isArray(appliedTags)) {
      console.warn('[resolveTags] Invalid appliedTags:', appliedTags);
      return resolved;
    }

    // Apply brand theme colors (if any)
    const brandTag = appliedTags.find(t => t.key === 'brand');
    if (brandTag?.expandedValues) {
      // Brand sets all the colors
      Object.assign(resolved, brandTag.expandedValues);
      resolved.brand = brandTag.value;
    }

    // Apply non-design tags
    const modelTag = appliedTags.find(t => t.key === 'model');
    if (modelTag) {
      resolved.model = modelTag.value;
    }

    const frameworkTag = appliedTags.find(t => t.key === 'framework');
    if (frameworkTag) {
      resolved.framework = frameworkTag.value;
    }

    const runnerTag = appliedTags.find(t => t.key === 'runner');
    if (runnerTag) {
      resolved.runner = runnerTag.value;
    }

    return resolved;
  } catch (error) {
    console.error('[resolveTags] Error resolving tags:', error);
    return resolved;
  }
}

/**
 * Generate AI prompt section from resolved tags
 */
export function generatePromptFromTags(resolved: ResolvedTags, projectName?: string, isNewProject?: boolean): string {
  const sections: string[] = [];

  // Add priority header to establish hierarchy
  sections.push(`═══════════════════════════════════════════════════════════════════
🎯 USER-SPECIFIED DESIGN (HIGHEST PRIORITY - OVERRIDES ALL DEFAULTS)
═══════════════════════════════════════════════════════════════════

CRITICAL PRIORITY LEVELS:
[PRIORITY 1] User's explicit tag selections (below) - MUST be implemented exactly
[PRIORITY 2] Template functionality and structure - keep this  
[PRIORITY 3] Base design system defaults - use only if no tags specified

${isNewProject ? `
⚠️  TEMPLATE TRANSFORMATION REQUIRED ⚠️

You are working with a template that has its own existing design.
Your job: TRANSFORM the template's visual design to match the specifications below.

DO NOT just add styles on top - REPLACE the template's design language:
- Modify the template's CSS/styling files 
- Update component designs (buttons, cards, layouts, navigation)
- Change visual aesthetics while preserving functionality
- The template STRUCTURE is fine, but its VISUAL DESIGN must change
` : ''}`);

  // Framework section - MANDATORY with explicit degit command
  if (resolved.framework) {
    const frameworkDef = findTagDefinition('framework');
    const frameworkOption = frameworkDef?.options?.find(o => o.value === resolved.framework);

    if (frameworkOption && frameworkDef?.promptTemplate) {
      // Substitute template variables
      let prompt = frameworkDef.promptTemplate
        .replace('{label}', frameworkOption.label)
        .replace('{value}', frameworkOption.value)
        .replace('{repository}', frameworkOption.repository || '')
        .replace('{branch}', frameworkOption.branch || 'main')
        .replace('{{projectName}}', projectName || '<project-name>');

      sections.push(`## Framework Requirement (MANDATORY)\n\n${prompt}`);
    } else {
      // Fallback if no template defined
      sections.push(`## Framework Requirement (MANDATORY)

CRITICAL: The user has explicitly selected ${resolved.framework} as the framework.
You MUST use ${resolved.framework} for this project. Do NOT suggest or use any other framework.

Set up the project structure according to ${resolved.framework} best practices and conventions.`);
    }
  }

  // Design section - MANDATORY when brand is selected
  if (resolved.brand) {
    sections.push('\n## Design Constraints (MANDATORY - User-Specified)\n');
    sections.push('CRITICAL: The user has explicitly configured these design preferences. Follow these specifications precisely:\n');

    const brandDef = findTagDefinition('brand');
    const brandOption = brandDef?.options?.find(o => o.value === resolved.brand);

    if (brandOption) {
      sections.push(`**Brand Aesthetic (MANDATORY):**`);
      sections.push(`Match the visual style and feel of ${brandOption.label} (${brandOption.description}).`);
    }

    sections.push(`\n**Color Palette (MANDATORY - DO NOT DEVIATE):**`);
    sections.push(`- Primary: ${resolved.primaryColor} (use for CTAs, primary buttons, brand elements)`);
    sections.push(`- Secondary: ${resolved.secondaryColor} (use for secondary actions, supporting elements)`);
    sections.push(`- Accent: ${resolved.accentColor} (use for highlights, badges, important elements)`);
    sections.push(`- Neutral Light: ${resolved.neutralLight} (use for light backgrounds, cards, containers)`);
    sections.push(`- Neutral Dark: ${resolved.neutralDark} (use for text, dark backgrounds, borders)`);
    sections.push(`\nYou MUST use ONLY these 5 colors. Do NOT introduce any additional colors outside this palette.`);

    sections.push('\n**Technical Requirements:**');
    sections.push('- Define all colors as CSS custom properties (e.g., --color-primary, --color-secondary)');
    sections.push('- NEVER hardcode hex values directly in components');
    sections.push('- Use semantic color names that reference the custom properties');
    sections.push('- NEVER use emojis in the UI. Instead, use Lucide React icons for all visual elements');
  } else {
    // Even with no design tags, enforce icon usage
    sections.push('\n**UI Guidelines:**');
    sections.push('- NEVER use emojis in the UI. Instead, use Lucide React icons for all visual elements');
  }

  return sections.filter(s => s).join('\n');
}

/**
 * Validate a tag value
 */
export function validateTagValue(key: string, value: string): { valid: boolean; error?: string } {
  const def = findTagDefinition(key);
  if (!def) {
    return { valid: false, error: 'Unknown tag key' };
  }

  // For color inputs, validate hex format
  if (def.inputType === 'color') {
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!hexRegex.test(value)) {
      return { valid: false, error: 'Invalid hex color format. Use #RRGGBB or #RGB' };
    }
  }

  // For select inputs, ensure value is in options
  // Skip validation for dynamic tags (e.g., runner) where options are populated at runtime
  if (def.inputType === 'select' && def.options && def.options.length > 0) {
    const validValues = def.options.map(o => o.value);
    if (!validValues.includes(value)) {
      return { valid: false, error: 'Invalid option selected' };
    }
  }

  return { valid: true };
}

/**
 * Validate a set of applied tags for conflicts
 */
export function validateTagSet(tags: AppliedTag[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for conflicting single-value tags and maxSelections
  const tagCounts = new Map<string, number>();
  tags.forEach(tag => {
    tagCounts.set(tag.key, (tagCounts.get(tag.key) || 0) + 1);
  });

  tagCounts.forEach((count, key) => {
    const def = findTagDefinition(key);

    // Check if tag doesn't allow multiple but has multiple
    if (!def?.allowMultiple && count > 1) {
      errors.push(`Multiple values for tag '${key}' which only allows one`);
    }

    // Check if tag exceeds maxSelections
    if (def?.maxSelections && count > def.maxSelections) {
      errors.push(`Too many values for tag '${key}': ${count} selected, maximum is ${def.maxSelections}`);
    }
  });

  // Validate each tag value
  tags.forEach(tag => {
    const validation = validateTagValue(tag.key, tag.value);
    if (!validation.valid) {
      errors.push(`Invalid tag ${tag.key}:${tag.value} - ${validation.error}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}
