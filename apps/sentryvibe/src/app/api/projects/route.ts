import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/node';
import { createInstrumentedCodex } from '@sentry/node';
import { metrics } from '@sentry/core';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { projects } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { AgentId } from '@sentryvibe/agent-core/types/agent';
import { createClaudeCode } from 'ai-sdk-provider-claude-code';
import { generateObject } from 'ai';
import { ProjectMetadataSchema } from '@/schemas/metadata';

// Create Claude Code provider - inherits authentication from local CLI
const claudeCode = createClaudeCode();

const CODEX_MODEL = 'gpt-5-codex';

export async function GET() {
  try {
    const allProjects = await db.select().from(projects).orderBy(projects.createdAt);
    return NextResponse.json({ projects: allProjects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

function buildMetadataPrompt(userPrompt: string): string {
  return `User wants to build: "${userPrompt}"

Generate project metadata based on this request.

Available icons: Folder, Code, Layout, Database, Zap, Globe, Lock, Users, ShoppingCart, Calendar, MessageSquare, FileText, Image, Music, Video, CheckCircle, Star

Generate a slug (kebab-case), friendly name, description, and appropriate icon.`;
}

async function runCodexMetadataPrompt(promptText: string): Promise<string> {
  const codex = await createInstrumentedCodex({
    workingDirectory: process.cwd(),
  });

  const thread = codex.startThread({
    sandboxMode: "danger-full-access",
    model: CODEX_MODEL,
    workingDirectory: process.cwd(),
    skipGitRepoCheck: true,
  });

  // Consume events directly to preserve Sentry async context for AI spans
  const { events } = await thread.runStreamed(promptText);
  let accumulated = '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  return accumulated;
}

export async function POST(request: Request) {
  try {
    const { prompt, agent = 'claude-code', tags } = (await request.json()) as { prompt: string; agent?: AgentId; tags?: { key: string; value: string }[] };

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    console.log('Selected tags:', tags);

    Sentry.logger.info(
      Sentry.logger.fmt`Creating project from prompt ${{
        prompt,
        promptPreview: prompt.substring(0, 100),
        agent,
        operation: 'project_creation',
      }}`
    );

    const metadataPrompt = buildMetadataPrompt(prompt);
    let metadata;

    // Use Claude Haiku with structured output
    if (agent === 'claude-code') {
      try {
        const result = await generateObject({
          model: claudeCode('claude-haiku-4-5'),
          schema: ProjectMetadataSchema,
          prompt: metadataPrompt,
        });

        metadata = result.object;
      } catch (error) {
        // If validation failed but we got valid JSON, extract it with fallback icon
        if (error && typeof error === 'object' && 'text' in error) {
          try {
            const parsed = JSON.parse((error as { text: string }).text);
            metadata = {
              slug: parsed.slug || 'generated-project',
              friendlyName: parsed.friendlyName || 'Generated Project',
              description: parsed.description || prompt.substring(0, 150),
              icon: 'Code', // Fallback to Code if invalid icon chosen
            };
          } catch (parseError) {
            // Fall through to simple metadata generation
          }
        }
      }
    } else if (agent === 'openai-codex') {
      try {
        const jsonResponse = await runCodexMetadataPrompt(metadataPrompt);

        if (jsonResponse && jsonResponse.trim().length > 0) {
          let cleanedResponse = jsonResponse.trim();
          cleanedResponse = cleanedResponse.replace(/```json\s*/g, '');
          cleanedResponse = cleanedResponse.replace(/```\s*/g, '');
          cleanedResponse = cleanedResponse.trim();

          const jsonMatches = [...cleanedResponse.matchAll(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g)];

          for (let i = 0; i < jsonMatches.length; i++) {
            try {
              const candidate = jsonMatches[i][0];
              const parsed = JSON.parse(candidate);

              if (parsed.slug && parsed.friendlyName && parsed.description && parsed.icon) {
                metadata = parsed;
                break;
              }
            } catch (parseError) {
              // Try next match
            }
          }
        }
      } catch (error) {
        // Fall through to simple metadata generation
      }
    }

    // If metadata is still undefined, use fallback
    if (!metadata) {
      const slug = prompt
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50);

      const words = prompt.split(/\s+/).filter(w => w.length > 0);
      const friendlyName = words
        .slice(0, 8)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      metadata = {
        slug: slug || 'project-' + Date.now(),
        friendlyName: friendlyName || 'New Project',
        description: prompt.substring(0, 150) || 'A new project',
        icon: 'Code',
      };
    }

    // Check for slug collision
    let finalSlug = metadata.slug;
    const existing = await db.select().from(projects).where(eq(projects.slug, finalSlug));

    if (existing.length > 0) {
      // Append timestamp to ensure uniqueness
      finalSlug = `${metadata.slug}-${Date.now()}`;
      console.log(`⚠️  Slug collision detected, using: ${finalSlug}`);
    }

    // Create the project
    const [project] = await db.insert(projects).values({
      name: metadata.friendlyName,
      slug: finalSlug,
      description: metadata.description,
      icon: metadata.icon,
      status: 'pending',
      originalPrompt: prompt,
      tags: tags || null, // Store tags if provided
    }).returning();

    console.log(`✅ Project created: ${project.id}`);

    // Track project submission with key tags
    const submissionAttributes: Record<string, string> = {
      project_id: project.id,
    };
    
    // Extract the 4 key tags we care about
    if (tags && Array.isArray(tags)) {
      tags.forEach((tag: { key: string; value: string }) => {
        if (tag.key === 'model' || tag.key === 'framework' || tag.key === 'runner' || tag.key === 'brand') {
          submissionAttributes[tag.key] = tag.value;
        }
      });
    }
    
    // Track project submission
    metrics.count('project.submitted', 1, {
      attributes: submissionAttributes
      // e.g., { project_id: '123', model: 'claude-sonnet-4-5', framework: 'next', brand: 'sentry', runner: 'abc-123' }
    });

    return NextResponse.json({
      project,
    });
  } catch (error) {
    console.error('Failed to create project:', error);
    return NextResponse.json(
      {
        error: 'Failed to create project',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
