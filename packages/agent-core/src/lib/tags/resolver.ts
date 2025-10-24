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

  try {
    if (!appliedTags || !Array.isArray(appliedTags)) {
      console.warn('[resolveTags] Invalid appliedTags:', appliedTags);
      return resolved;
    }

  // First pass: Apply brand theme colors (if any)
  const brandTag = appliedTags.find(t => t.key === 'brand');
  if (brandTag?.expandedValues) {
    // Brand sets the base colors
    Object.assign(resolved, brandTag.expandedValues);
    resolved.brand = brandTag.value;
  }

  // Second pass: Apply individual overrides
  const primaryColorTag = appliedTags.find(t => t.key === 'primaryColor');
  if (primaryColorTag) resolved.primaryColor = primaryColorTag.value;

  const secondaryColorTag = appliedTags.find(t => t.key === 'secondaryColor');
  if (secondaryColorTag) resolved.secondaryColor = secondaryColorTag.value;

  const accentColorTag = appliedTags.find(t => t.key === 'accentColor');
  if (accentColorTag) resolved.accentColor = accentColorTag.value;

  const neutralLightTag = appliedTags.find(t => t.key === 'neutralLight');
  if (neutralLightTag) resolved.neutralLight = neutralLightTag.value;

  const neutralDarkTag = appliedTags.find(t => t.key === 'neutralDark');
  if (neutralDarkTag) resolved.neutralDark = neutralDarkTag.value;

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

  // Style tags (multiple allowed)
  const styleTags = appliedTags.filter(t => t.key === 'style');
  if (styleTags.length > 0) {
    resolved.styles = styleTags.map(t => t.value);
  }

  // Typography tags
  const headingFontTag = appliedTags.find(t => t.key === 'headingFont');
  if (headingFontTag) {
    resolved.headingFont = headingFontTag.value;
  }

  const bodyFontTag = appliedTags.find(t => t.key === 'bodyFont');
  if (bodyFontTag) {
    resolved.bodyFont = bodyFontTag.value;
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
export function generatePromptFromTags(resolved: ResolvedTags): string {
  const sections: string[] = [];

  // Framework section - MANDATORY
  if (resolved.framework) {
    sections.push(`## Framework Requirement (MANDATORY)

CRITICAL: The user has explicitly selected ${resolved.framework} as the framework.
You MUST use ${resolved.framework} for this project. Do NOT suggest or use any other framework.

Set up the project structure according to ${resolved.framework} best practices and conventions.`);
  }

  // Design section - MANDATORY
  const hasDesignTags = resolved.primaryColor || resolved.brand || (resolved.styles && resolved.styles.length > 0) || resolved.headingFont || resolved.bodyFont;
  if (hasDesignTags) {
    sections.push('\n## Design Constraints (MANDATORY - User-Specified)\n');
    sections.push('CRITICAL: The user has explicitly configured these design preferences. Follow these specifications precisely:\n');

    // Brand and Colors
    if (resolved.brand) {
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
    } else if (resolved.primaryColor) {
      // Individual colors without brand theme - STRENGTHEN
      sections.push('**Color Palette (MANDATORY - DO NOT DEVIATE):**');

      if (resolved.primaryColor) {
        sections.push(`- Primary: ${resolved.primaryColor} (use for CTAs, primary buttons, brand elements)`);
      }
      if (resolved.secondaryColor) {
        sections.push(`- Secondary: ${resolved.secondaryColor} (use for secondary actions, supporting elements)`);
      }
      if (resolved.accentColor) {
        sections.push(`- Accent: ${resolved.accentColor} (use for highlights, badges, important elements)`);
      }
      if (resolved.neutralLight) {
        sections.push(`- Neutral Light: ${resolved.neutralLight} (use for light backgrounds, cards, containers)`);
      }
      if (resolved.neutralDark) {
        sections.push(`- Neutral Dark: ${resolved.neutralDark} (use for text, dark backgrounds, borders)`);
      }

      sections.push(`\nYou MUST use ONLY these colors. Do NOT introduce any additional colors outside this palette.`);
    }

    // Typography - MANDATORY
    if (resolved.headingFont || resolved.bodyFont) {
      sections.push('\n**Typography (MANDATORY):**');

      if (resolved.headingFont) {
        sections.push(`- Heading Font: ${resolved.headingFont} (use for all h1, h2, h3, h4, h5, h6 elements)`);
      }
      if (resolved.bodyFont) {
        sections.push(`- Body Font: ${resolved.bodyFont} (use for paragraphs, labels, buttons, and all UI text)`);
      }

      sections.push('\nImport these fonts from Google Fonts (or use system fonts as specified). Do NOT substitute with other fonts.');
    }

    // Style/aesthetic direction - ADD DETAILED GUIDANCE
    if (resolved.styles && resolved.styles.length > 0) {
      const styleDef = findTagDefinition('style');

      if (styleDef) {
        sections.push('\n**Style Direction (MANDATORY):**');

        const stylesList = resolved.styles.join(', ');
        sections.push(`The user explicitly selected: ${stylesList}`);
        sections.push(`\nYou MUST apply these aesthetics throughout the design. This is NOT a suggestion.`);
        sections.push('\n**Detailed Style Requirements:**');

        // Add detailed, concrete guidance for each style
        resolved.styles.forEach((style, index) => {
          const option = styleDef.options?.find(o => o.value === style);
          if (option) {
            sections.push(`\n${index + 1}. **${option.label}:**`);
            sections.push(`   - Description: ${option.description}`);

            // Add concrete implementation guidance
            const guidance = getDetailedStyleGuidance(style);
            guidance.split('\n').forEach(line => {
              if (line.trim()) sections.push(`   ${line}`);
            });
          }
        });

        sections.push('\n**Implementation Requirements:**');
        sections.push('- Apply these aesthetics through: typography choices, spacing decisions, component design patterns, color usage, interaction patterns, and overall visual treatment');
        sections.push('- Every design decision should reflect the selected style characteristics');
        sections.push('- If styles seem conflicting, prioritize them in the order listed above');
      }
    }

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
 * Get detailed, concrete style guidance for implementation
 */
function getDetailedStyleGuidance(style: string): string {
  const guidance: Record<string, string> = {
    'modern': `- Use contemporary UI patterns (cards, floating elements, subtle shadows)
- Prefer sans-serif fonts (Inter, SF Pro, Roboto)
- Use 8px grid system for consistent spacing
- Embrace white space - don't crowd elements together
- Sharp corners or subtle rounded corners (4px-8px border-radius)
- Clean, uncluttered layouts with clear visual hierarchy`,

    'minimal': `- Strip away all non-essential elements
- Generous spacing (16px-32px margins, ample padding)
- Limited color palette - rely heavily on neutrals
- Simple typography hierarchy (maximum 3 font sizes)
- Avoid decorative elements, flourishes, and embellishments
- Focus on content and functionality over decoration`,

    'professional': `- Consistent spacing and alignment throughout
- Formal typography with clear hierarchy and readable sizes
- Conservative, trustworthy color usage
- Button states clearly defined (hover, active, disabled)
- Forms and inputs are highly polished and validated
- Attention to detail in every interaction`,

    'bold': `- High contrast color combinations
- Large typography (headings 32px or larger)
- Strong geometric shapes and patterns
- Confident, tall button sizes (48px+ height for primary CTAs)
- Don't shy away from color saturation
- Make strong visual statements`,

    'elegant': `- Refined details (subtle transitions 300-500ms, micro-interactions)
- Sophisticated spacing (consider golden ratio: 1.618)
- Serif fonts for headings OR elegant sans-serifs (Cormorant, Playfair)
- Muted, tasteful color palette (avoid harsh saturation)
- Gentle, smooth animations with ease-in-out
- Premium feel through careful typography and spacing`,

    'playful': `- Rounded shapes (12px+ border radius on most elements)
- Friendly, approachable language in UI copy and labels
- Lighthearted micro-interactions and hover effects
- Consider illustrations or friendly icon styles
- Warm, inviting color temperatures
- Fun transitions and animations (but not overdone)`,

    'luxurious': `- Premium feel through generous spacing and typography
- High-quality imagery if used (avoid generic stock photos)
- Refined color choices (rich, deep tones - not bright)
- Subtle textures or gentle gradients
- Attention to typographic details (proper kerning, hierarchy)
- Everything feels expensive and carefully considered`,

    'trustworthy': `- Clear visual hierarchy (obvious primary actions)
- High readability (16px+ body text, excellent contrast)
- Familiar UI patterns (standard navigation, clear labels)
- Accessible color contrasts (WCAG AA minimum)
- Predictable interaction patterns
- Consistent design language throughout`,

    'friendly': `- Approachable, conversational tone in all copy
- Warm color palette (avoid cold grays and blues)
- Inviting interaction states (friendly hover effects)
- Rounded, soft shapes (avoid sharp edges)
- Welcome messaging and helpful copy throughout
- Make users feel comfortable and supported`,

    'energetic': `- Vibrant, saturated colors
- Dynamic layouts (consider asymmetry, diagonals)
- Active feeling through subtle motion hints
- Bold color blocking and contrast
- High energy typography choices (strong weights)
- Create excitement through visual dynamism`,

    'clean': `- Uncluttered layouts with focused content
- Clear visual hierarchy (obvious what's important)
- Remove all distractions and unnecessary elements
- Ample white space around all elements
- Simple, purposeful color usage (2-3 colors max)
- Everything has a clear purpose`,

    'sophisticated': `- Refined aesthetic choices (avoid trends)
- Balanced composition and layout
- Mature style (professional without being stuffy)
- Quality over quantity in design elements
- Thoughtful typography pairing
- Understated elegance throughout`,

    'vibrant': `- Rich, lively colors throughout
- High energy color palette
- Don't fear color saturation
- Lively presence through bold color choices
- Energetic but not chaotic
- Colors should feel alive and dynamic`,

    'warm': `- Inviting color temperatures (yellows, oranges, warm grays)
- Soft edges and rounded corners (8px+ border radius)
- Approachable feel through spacing and typography
- Comfortable, cozy aesthetic
- Welcoming interaction design
- Make users feel at home`,

    'tech-forward': `- Sharp, precise edges (0-2px border radius)
- Monospace font accents (for code, technical details)
- Futuristic elements (gradients, glassmorphism)
- Dark mode friendly design
- Technical sophistication in details
- Modern, cutting-edge aesthetic`,
  };

  return guidance[style] || `- Apply the ${style} aesthetic through appropriate design choices`;
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
