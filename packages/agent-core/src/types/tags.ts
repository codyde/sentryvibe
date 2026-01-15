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
 * Resolved tag values after processing brand expansions
 */
export interface ResolvedTags {
  // Direct tag values
  model?: string;
  framework?: string;
  runner?: string;

  // Design values (resolved from brand)
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  neutralLight?: string;
  neutralDark?: string;

  // Track which brand was used (if any)
  brand?: string;
}

/**
 * Tags included in build request
 */
export interface BuildTags {
  applied: AppliedTag[];
  resolved: ResolvedTags;
}
