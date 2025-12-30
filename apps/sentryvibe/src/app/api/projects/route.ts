import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { Codex } from '@openai/codex-sdk';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { projects, messages } from '@sentryvibe/agent-core/lib/db/schema';
import { eq, or, isNull } from 'drizzle-orm';
import type { AgentId } from '@sentryvibe/agent-core/types/agent';
import { generateStructuredOutput } from '@/lib/anthropic-client';
import { ProjectMetadataSchema } from '@/schemas/metadata';
import { getSession, isLocalMode, getUserId } from '@/lib/auth-helpers';

const CODEX_MODEL = 'gpt-5-codex';

export async function GET() {
  try {
    // In local mode, return all projects (no user filtering)
    if (isLocalMode()) {
      const allProjects = await db.select().from(projects).orderBy(projects.createdAt);
      return NextResponse.json({ projects: allProjects });
    }

    // In hosted mode, filter by user
    const userId = await getUserId();
    
    if (!userId) {
      // Not authenticated - return empty list
      return NextResponse.json({ projects: [] });
    }

    // Return projects owned by user OR projects with no owner (legacy)
    const userProjects = await db
      .select()
      .from(projects)
      .where(
        or(
          eq(projects.userId, userId),
          isNull(projects.userId)
        )
      )
      .orderBy(projects.createdAt);
    
    return NextResponse.json({ projects: userProjects });
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
  // Note: Codex is auto-instrumented by Sentry's openAIIntegration via OTel
  const codex = new Codex();

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
    // Check authentication (required for creating projects in hosted mode)
    const session = await getSession();
    const userId = session?.user?.id ?? null;
    
    // In hosted mode, require authentication
    if (!isLocalMode() && !userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Extract User-Agent for browser tracking
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    // Simple browser detection from User-Agent
    const getBrowserType = (ua: string): string => {
      const uaLower = ua.toLowerCase();
      if (uaLower.includes('edg/')) return 'edge';
      if (uaLower.includes('chrome/') && !uaLower.includes('edg/')) return 'chrome';
      if (uaLower.includes('firefox/')) return 'firefox';
      if (uaLower.includes('safari/') && !uaLower.includes('chrome/')) return 'safari';
      if (uaLower.includes('opera/') || uaLower.includes('opr/')) return 'opera';
      return 'other';
    };
    
    const browserType = getBrowserType(userAgent);

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

    // Use Claude with structured output via Anthropic SDK
    if (agent === 'claude-code') {
      try {
        console.log('🤖 Generating project metadata with Claude...');
        const result = await generateStructuredOutput({
          model: 'claude-haiku-4-5',
          schema: ProjectMetadataSchema,
          prompt: metadataPrompt,
        });

        metadata = result.object;
        console.log('✅ AI metadata generated:', metadata);
      } catch (error) {
        console.error('❌ AI metadata generation failed:', error);
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
            console.log('📝 Recovered partial metadata from error:', metadata);
          } catch (parseError) {
            console.error('❌ Failed to parse metadata from error response');
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

    // If metadata is still undefined, use fallback with SHORTER names
    if (!metadata) {
      console.log('⚠️ AI metadata generation failed, using fallback naming');
      
      // Extract key words, filtering out common filler words
      const fillerWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'it', 'that', 'this', 'i', 'want', 'would', 'like', 'please', 'can', 'you', 'me', 'my', 'make', 'create', 'build']);
      const words = prompt
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2 && !fillerWords.has(w))
        .slice(0, 4); // Take first 4 meaningful words
      
      // Generate short slug (max 30 chars)
      const slug = words
        .join('-')
        .replace(/[^a-z0-9-]+/g, '')
        .substring(0, 30) || 'project-' + Date.now();

      // Generate friendly name (max 4 words, title case)
      const friendlyName = words
        .slice(0, 4)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ') || 'New Project';

      metadata = {
        slug,
        friendlyName,
        description: prompt.substring(0, 150) || 'A new project',
        icon: 'Code',
      };
      
      console.log('📝 Fallback metadata generated:', { slug, friendlyName });
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
      userId: userId, // Associate with authenticated user (null in local mode)
    }).returning();

    console.log(`✅ Project created: ${project.id}`);

    // Persist initial user prompt as first chat message
    try {
      await db.insert(messages).values({
        projectId: project.id,
        role: 'user',
        content: prompt,
      });
    } catch (messageError) {
      console.error(`[projects POST] Failed to persist initial prompt for project ${project.id}:`, messageError);
    }

    // Track project submission with key tags
    const submissionAttributes: Record<string, string> = {
      project_id: project.id,
      browser: browserType,
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
    console.log('[DEBUG] About to send project.submitted metric with attributes:', submissionAttributes);
    Sentry.metrics.count('project.submitted', 1, {
      attributes: submissionAttributes
      // e.g., { project_id: '123', browser: 'chrome', model: 'claude-sonnet-4-5', framework: 'next', brand: 'sentry', runner: 'abc-123' }
    });
    console.log('[DEBUG] Metric call completed');

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
