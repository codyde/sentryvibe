import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createInstrumentedCodex } from '@sentry/node';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { projects } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { AgentId } from '@sentryvibe/agent-core/types/agent';
import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { ProjectMetadataSchema } from '@/schemas/metadata';

const CODEX_MODEL = 'gpt-5-codex';

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
    const { prompt, agent = 'claude-code' } = (await request.json()) as { prompt: string; agent?: AgentId };

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    console.log(`[projects] Creating project from prompt: "${prompt.substring(0, 100)}..."`);

    const metadataPrompt = buildMetadataPrompt(prompt);
    let metadata;

    // Use Claude Haiku with structured output via AI SDK
    if (agent === 'claude-code') {
      console.log('[projects] Using Claude Haiku for metadata extraction (structured output)');

      try {
        const result = await generateObject({
          model: anthropic('claude-haiku-4-5'),
          schema: ProjectMetadataSchema,
          prompt: metadataPrompt,
        });

        metadata = result.object;
        console.log('✅ Got structured metadata:', metadata);
      } catch (error) {
        console.error('❌ Claude structured output failed:', error);
        console.log('🔄 Falling back to simple metadata generation...');
      }
    } else {
      // Use Codex for metadata
      console.log('[projects] Using Codex for metadata extraction');

      try {
        const jsonResponse = await runCodexMetadataPrompt(metadataPrompt);

        if (!jsonResponse || jsonResponse.trim().length === 0) {
          console.error('❌ Codex returned an empty response for metadata prompt');
        } else {
          console.log('📥 Raw Codex response:', JSON.stringify(jsonResponse));

          // Try to parse Codex response
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
        console.error('❌ Codex metadata extraction failed:', error);
      }
    }

    // If metadata is still undefined, use fallback
    if (!metadata) {
      console.log('🔄 Falling back to simple metadata generation...');

      // Better slug generation
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

      console.log('📋 Fallback metadata:', metadata);
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
    }).returning();

    console.log(`✅ Project created: ${project.id}`);

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
