import { z } from 'zod';

/**
 * Project metadata schema for structured output
 * Used by runner's project analyzer for AI-generated project metadata
 */
export const ProjectMetadataSchema = z.object({
  slug: z.string().describe('URL-friendly project identifier (lowercase, hyphens)'),
  friendlyName: z.string().describe('Human-readable project name'),
  description: z.string().describe('Brief description of what the project does'),
  icon: z.enum([
    'Folder', 'Code', 'Layout', 'Database', 'Zap', 'Globe', 'Lock',
    'Users', 'ShoppingCart', 'Calendar', 'MessageSquare', 'FileText',
    'Image', 'Music', 'Video', 'CheckCircle', 'Star'
  ]).describe('Icon name from available Lucide icons'),
});

export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;

/**
 * Template analysis schema for structured output
 * Used by runner to select the best template based on user prompt
 */
export const TemplateAnalysisSchema = z.object({
  templateId: z.string().describe('ID of the selected template'),
  reasoning: z.string().describe('Brief explanation of why this template was chosen'),
  confidence: z.number().min(0).max(1).describe('Confidence score from 0.0 to 1.0'),
});

export type TemplateAnalysis = z.infer<typeof TemplateAnalysisSchema>;

/**
 * Project naming schema for structured output
 * Used by runner to generate project name and slug from user prompt
 */
export const ProjectNamingSchema = z.object({
  slug: z.string().describe('URL-friendly project identifier (lowercase, hyphens, 2-4 words)'),
  friendlyName: z.string().describe('Human-readable project name (Title Case, 2-5 words)'),
});

export type ProjectNaming = z.infer<typeof ProjectNamingSchema>;

/**
 * Available icon names for project metadata
 */
export const AVAILABLE_ICONS = [
  'Folder', 'Code', 'Layout', 'Database', 'Zap', 'Globe', 'Lock',
  'Users', 'ShoppingCart', 'Calendar', 'MessageSquare', 'FileText',
  'Image', 'Music', 'Video', 'CheckCircle', 'Star'
] as const;

export type ProjectIcon = typeof AVAILABLE_ICONS[number];
