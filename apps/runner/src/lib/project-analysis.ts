/**
 * Project Analysis - Combines template selection and metadata extraction
 * Runs AI SDK calls (Claude Code or Codex) to analyze user prompts
 * This centralizes all AI analysis in the runner (previously split between frontend/runner)
 */

import * as Sentry from '@sentry/node';
import { createInstrumentedCodex } from '@sentry/node';
import {
  DEFAULT_CLAUDE_MODEL_ID,
  type AgentId,
  type ClaudeModelId,
} from '@sentryvibe/agent-core/types/agent';
import type { Template } from '@sentryvibe/agent-core/lib/templates/config';
import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { analyzePromptForTemplate } from './template-analysis.js';

// Metadata schema
const ProjectMetadataSchema = z.object({
  slug: z.string().describe('URL-friendly project identifier (lowercase, hyphens)'),
  friendlyName: z.string().describe('Human-readable project name'),
  description: z.string().describe('Brief description of what the project does'),
  icon: z.enum([
    'Folder', 'Code', 'Layout', 'Database', 'Zap', 'Globe', 'Lock',
    'Users', 'ShoppingCart', 'Calendar', 'MessageSquare', 'FileText',
    'Image', 'Music', 'Video', 'CheckCircle', 'Star'
  ]).describe('Icon name from available Lucide icons'),
});

type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;

const CODEX_MODEL = 'gpt-5-codex';

function buildMetadataPrompt(userPrompt: string): string {
  return `User wants to build: "${userPrompt}"

Generate project metadata based on this request.

Available icons: Folder, Code, Layout, Database, Zap, Globe, Lock, Users, ShoppingCart, Calendar, MessageSquare, FileText, Image, Music, Video, CheckCircle, Star

Generate a slug (kebab-case), friendly name, description, and appropriate icon.`;
}

/**
 * Extract metadata using Codex SDK
 */
async function extractMetadataWithCodex(prompt: string): Promise<ProjectMetadata> {
  const codex = await createInstrumentedCodex({
    workingDirectory: process.cwd(),
  });

  const thread = codex.startThread({
    sandboxMode: "danger-full-access",
    model: CODEX_MODEL,
    workingDirectory: process.cwd(),
    skipGitRepoCheck: true,
  });

  const metadataPrompt = buildMetadataPrompt(prompt);
  const { events } = await thread.runStreamed(metadataPrompt);
  let accumulated = '';

  for await (const event of events as AsyncIterable<any>) {
    if (event?.type === 'item.completed') {
      const item = event.item as Record<string, unknown> | undefined;
      const text = typeof item?.text === 'string' ? item.text : undefined;
      if (text) {
        accumulated += text;
      }
    } else if (event?.type === 'turn.completed' && typeof event.finalResponse === 'string') {
      accumulated += event.finalResponse;
    }
  }

  // Parse JSON from response
  const jsonMatch = accumulated.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in Codex response');
  }

  return JSON.parse(jsonMatch[0]);
}

/**
 * Extract metadata using Claude with structured output
 */
async function extractMetadataWithClaude(prompt: string): Promise<ProjectMetadata> {
  const metadataPrompt = buildMetadataPrompt(prompt);

  const result = await generateObject({
    model: anthropic('claude-haiku-4-5'),
    schema: ProjectMetadataSchema,
    prompt: metadataPrompt,
  });

  return result.object;
}

/**
 * Main analysis function - combines template selection and metadata extraction
 * Returns everything the frontend needs to create/update the project
 */
export async function analyzeProjectRequest(
  prompt: string,
  agent: AgentId,
  templates: Template[],
  claudeModel?: ClaudeModelId
): Promise<{
  template: {
    id: string;
    name: string;
    framework: string;
    port: number;
    runCommand: string;
    repository: string;
    branch: string;
  };
  metadata: {
    slug: string;
    friendlyName: string;
    description: string;
    icon: string;
  };
  reasoning: string;
  confidence: number;
  analyzedBy: string;
}> {
  console.log(`[project-analysis] Analyzing prompt with ${agent}`);

  // Run both analyses in parallel for speed
  const [templateAnalysis, metadata] = await Promise.all([
    analyzePromptForTemplate(prompt, agent, templates, claudeModel),
    agent === 'claude-code'
      ? extractMetadataWithClaude(prompt)
      : extractMetadataWithCodex(prompt)
  ]);

  console.log(`[project-analysis] Analysis complete`);
  console.log(`[project-analysis] Template: ${templateAnalysis.templateName}`);
  console.log(`[project-analysis] Metadata: ${metadata.friendlyName} (${metadata.slug})`);

  return {
    template: {
      id: templateAnalysis.templateId,
      name: templateAnalysis.templateName,
      framework: templateAnalysis.framework,
      port: templateAnalysis.defaultPort,
      runCommand: templateAnalysis.devCommand,
      repository: templateAnalysis.repository,
      branch: templateAnalysis.branch,
    },
    metadata: {
      slug: metadata.slug,
      friendlyName: metadata.friendlyName,
      description: metadata.description,
      icon: metadata.icon,
    },
    reasoning: templateAnalysis.reasoning,
    confidence: templateAnalysis.confidence,
    analyzedBy: templateAnalysis.analyzedBy,
  };
}
