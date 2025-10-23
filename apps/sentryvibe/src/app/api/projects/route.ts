import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { projects } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { AgentId, ClaudeModelId } from '@sentryvibe/agent-core/types/agent';
import { sendCommandToRunner } from '@sentryvibe/agent-core/lib/runner/broker-state';
import { initializeProjectAnalysisHandler } from '@/services/project-analysis-handler';

// Initialize event handler once (handles PROJECT_ANALYZED events from runner)
initializeProjectAnalysisHandler();

export async function GET() {
  try {
    const allProjects = await db.select().from(projects).orderBy(projects.createdAt);
    return NextResponse.json({ projects: allProjects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { prompt, agent = 'claude-code', tags, claudeModel } = (await request.json()) as {
      prompt: string;
      agent?: AgentId;
      tags?: any[];
      claudeModel?: ClaudeModelId;
    };

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    console.log(`[projects] Creating project from prompt: "${prompt.substring(0, 100)}..."`);

    // NEW FLOW: Create project immediately with temporary data
    // Runner will analyze and send back real metadata via PROJECT_ANALYZED event
    const projectId = randomUUID();
    const tempSlug = `analyzing-${Date.now()}`;

    const [project] = await db.insert(projects).values({
      id: projectId,
      name: 'Analyzing...',
      slug: tempSlug,
      description: prompt.substring(0, 150),
      icon: 'Code',
      status: 'analyzing',
      originalPrompt: prompt,
      tags: tags || null,
    }).returning();

    console.log(`✅ Project created with temp data: ${project.id}`);

    // Send CREATE_PROJECT command to runner for AI analysis
    const runnerId = process.env.RUNNER_DEFAULT_ID || 'local';
    try {
      await sendCommandToRunner(runnerId, {
        id: randomUUID(),
        type: 'create-project',
        projectId: project.id,
        timestamp: new Date().toISOString(),
        payload: {
          prompt,
          agent,
          claudeModel,
          tags,
        },
      });

      console.log(`📤 CREATE_PROJECT command sent to runner`);

      // Runner will send PROJECT_ANALYZED event with real metadata
      // The event handler in /api/runner/events will update the project
    } catch (error) {
      console.error('❌ Failed to send command to runner:', error);

      // Update project status to indicate error
      await db.update(projects).set({
        status: 'failed',
        errorMessage: 'Failed to connect to runner for analysis',
      }).where(eq(projects.id, project.id));
    }

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
