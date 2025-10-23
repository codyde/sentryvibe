import { z } from 'zod';

/**
 * Project metadata schema for structured output
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
 */
export const TemplateAnalysisSchema = z.object({
  templateId: z.string().describe('ID of the selected template'),
  reasoning: z.string().describe('Brief explanation of why this template was chosen'),
  confidence: z.number().min(0).max(1).describe('Confidence score from 0.0 to 1.0'),
});

export type TemplateAnalysis = z.infer<typeof TemplateAnalysisSchema>;
