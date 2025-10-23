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
import { analyzePromptForTemplate } from './template-analysis.js';

// Project metadata type
interface ProjectMetadata {
  slug: string;
  friendlyName: string;
  description: string;
  icon: string;
}

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
 * Extract metadata using Anthropic API
 */
async function extractMetadataWithClaude(prompt: string): Promise<ProjectMetadata> {
  const metadataPrompt = buildMetadataPrompt(prompt);

  // Use direct Anthropic API for simple text generation
  const Anthropic = await import('@anthropic-ai/sdk').then(m => m.default);

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  console.log('[project-analysis] Calling Anthropic API for metadata extraction...');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: `You are a project metadata expert. Extract structured metadata from user prompts.

Output ONLY valid JSON matching this schema:
{
  "slug": "kebab-case-name",
  "friendlyName": "Display Name",
  "description": "Brief description",
  "icon": "Code" // Must be one of: Folder, Code, Layout, Database, Zap, Globe, Lock, Users, ShoppingCart, Calendar, MessageSquare, FileText, Image, Music, Video, CheckCircle, Star
}`,
    messages: [{
      role: 'user',
      content: metadataPrompt,
    }],
  });

  console.log('[project-analysis] Received metadata response');

  // Extract text from response
  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text content in Anthropic response');
  }

  console.log('[project-analysis] Raw metadata response:', textContent.text);

  // Parse JSON from response
  const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[project-analysis] Failed to find JSON in response:', textContent.text);
    throw new Error('No JSON found in Claude response');
  }

  console.log('[project-analysis] Extracted JSON:', jsonMatch[0]);
  const parsed = JSON.parse(jsonMatch[0]);

  // Validate required fields
  if (!parsed.slug || !parsed.friendlyName || !parsed.description || !parsed.icon) {
    throw new Error('Invalid metadata structure from Claude');
  }

  return parsed;
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

  try {
    console.log(`[project-analysis] Starting template analysis...`);
    const templateAnalysis = await analyzePromptForTemplate(prompt, agent, templates, claudeModel);
    console.log(`[project-analysis] ✅ Template analysis complete: ${templateAnalysis.templateName}`);

    console.log(`[project-analysis] Starting metadata extraction...`);
    const metadata = agent === 'claude-code'
      ? await extractMetadataWithClaude(prompt)
      : await extractMetadataWithCodex(prompt);
    console.log(`[project-analysis] ✅ Metadata extraction complete: ${metadata.friendlyName}`);

    console.log(`[project-analysis] Analysis complete`);
    console.log(`[project-analysis] Template: ${templateAnalysis.templateName}`);
    console.log(`[project-analysis] Metadata: ${metadata.friendlyName} (${metadata.slug})`);

    const result = {
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

    console.log(`[project-analysis] 🎉 Returning result to caller`);
    return result;
  } catch (error) {
    console.error(`[project-analysis] ❌ Analysis failed:`, error);
    console.error(`[project-analysis] Error details:`, error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(`[project-analysis] Stack trace:`, error.stack);
    }
    throw error; // Re-throw so runner handler can catch and emit error event
  }
}
