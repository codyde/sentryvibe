/**
 * Tag Resolution Logic
 *
 * Handles resolving tags, including brand expansion and override logic
 */

import { AppliedTag, ResolvedTags } from '../../types/tags';
import { findTagDefinition } from '../../config/tags';

/**
 * Resolve applied tags into final values
 *
 * Logic:
 * 1. Brand tags expand into multiple color values
 * 2. Individual color tags override brand values
 * 3. Non-design tags pass through directly
 */
export function resolveTags(appliedTags: AppliedTag[]): ResolvedTags {
  const resolved: ResolvedTags = {};

  // First pass: Apply brand theme colors (if any)
  const brandTag = appliedTags.find(t => t.key === 'brand');
  if (brandTag?.expandedValues) {
    // Brand sets the base colors
    Object.assign(resolved, brandTag.expandedValues);
    resolved.brand = brandTag.value;
  }

  // Second pass: Apply individual overrides
  const colorKeys = ['primaryColor', 'secondaryColor', 'accentColor', 'neutralLight', 'neutralDark'];
  for (const colorKey of colorKeys) {
    const colorTag = appliedTags.find(t => t.key === colorKey);
    if (colorTag) {
      resolved[colorKey as keyof ResolvedTags] = colorTag.value;
    }
  }

  // Third pass: Apply non-design tags
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

  // Style tag
  const styleTag = appliedTags.find(t => t.key === 'style');
  if (styleTag) {
    resolved.style = styleTag.value;
  }

  return resolved;
}

/**
 * Generate AI prompt section from resolved tags
 */
export function generatePromptFromTags(resolved: ResolvedTags): string {
  const sections: string[] = [];

  // Framework section
  if (resolved.framework) {
    const def = findTagDefinition('framework');
    if (def?.promptTemplate) {
      sections.push(def.promptTemplate.replace('{value}', resolved.framework));
    }
  }

  // Design section
  const hasDesignTags = resolved.primaryColor || resolved.brand || resolved.style;
  if (hasDesignTags) {
    sections.push('\n## Design Constraints\n');

    if (resolved.brand) {
      const brandDef = findTagDefinition('brand');
      const brandOption = brandDef?.options?.find(o => o.value === resolved.brand);

      if (brandOption && brandDef?.promptTemplate) {
        let prompt = brandDef.promptTemplate
          .replace('{value}', resolved.brand)
          .replace('{primaryColor}', resolved.primaryColor || '')
          .replace('{secondaryColor}', resolved.secondaryColor || '')
          .replace('{accentColor}', resolved.accentColor || '')
          .replace('{neutralLight}', resolved.neutralLight || '')
          .replace('{neutralDark}', resolved.neutralDark || '');

        sections.push(prompt);
      }
    } else {
      // Individual colors without brand theme
      sections.push('**Color Palette:**');

      if (resolved.primaryColor) {
        const def = findTagDefinition('primaryColor');
        if (def?.promptTemplate) {
          sections.push(`- ${def.promptTemplate.replace('{value}', resolved.primaryColor)}`);
        }
      }

      if (resolved.secondaryColor) {
        const def = findTagDefinition('secondaryColor');
        if (def?.promptTemplate) {
          sections.push(`- ${def.promptTemplate.replace('{value}', resolved.secondaryColor)}`);
        }
      }

      if (resolved.accentColor) {
        const def = findTagDefinition('accentColor');
        if (def?.promptTemplate) {
          sections.push(`- ${def.promptTemplate.replace('{value}', resolved.accentColor)}`);
        }
      }

      if (resolved.neutralLight) {
        const def = findTagDefinition('neutralLight');
        if (def?.promptTemplate) {
          sections.push(`- ${def.promptTemplate.replace('{value}', resolved.neutralLight)}`);
        }
      }

      if (resolved.neutralDark) {
        const def = findTagDefinition('neutralDark');
        if (def?.promptTemplate) {
          sections.push(`- ${def.promptTemplate.replace('{value}', resolved.neutralDark)}`);
        }
      }
    }

    // Style/aesthetic direction
    if (resolved.style) {
      const styleDef = findTagDefinition('style');
      const styleOption = styleDef?.options?.find(o => o.value === resolved.style);

      if (styleOption && styleDef?.promptTemplate) {
        sections.push('\n**Style Direction:**');
        let stylePrompt = styleDef.promptTemplate
          .replace('{value}', resolved.style)
          .replace('{description}', styleOption.description || '');
        sections.push(stylePrompt);
      }
    }

    sections.push('\n**Important:** Define these colors as CSS custom properties in your stylesheets. Never hardcode hex values directly in components.');
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
  if (def.inputType === 'select' && def.options) {
    const validValues = def.options.map(o => o.value);
    if (!validValues.includes(value)) {
      return { valid: false, error: 'Invalid option selected' };
    }
  }

  return { valid: true };
}
