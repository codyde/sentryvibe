/**
 * Tag Types
 *
 * Type definitions for the tag-based configuration system
 */

/**
 * An applied tag instance
 */
export interface AppliedTag {
  key: string;
  value: string;
  // For brand/theme tags - store the expanded color values
  expandedValues?: Record<string, string>;
  // Timestamp when tag was applied
  appliedAt: Date;
}

/**
 * Resolved tag values after processing brand expansions and overrides
 */
export interface ResolvedTags {
  // Direct tag values
  model?: string;
  framework?: string;
  runner?: string;

  // Design values (resolved from brand + overrides)
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  neutralLight?: string;
  neutralDark?: string;
  styles?: string[]; // Changed to array for multi-select

  // Typography
  headingFont?: string;
  bodyFont?: string;

  // Track which brand was used (if any)
  brand?: string;

  // Addons (infrastructure/integrations)
  addons?: string[];
}

/**
 * Tags included in build request
 */
export interface BuildTags {
  applied: AppliedTag[];
  resolved: ResolvedTags;
}
