import { NextRequest } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { projects } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface GithubRepoMetadata {
  status: 'pending' | 'creating' | 'completed' | 'failed';
  repoUrl?: string;
  buildId?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return await Sentry.startSpan(
    {
      name: 'POST /api/projects/[id]/github-repo',
      op: 'http.server',
      attributes: {
        'http.method': 'POST',
      },
    },
    async () => {
      try {
        const { id: projectId } = await params;

        // Get the project
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);

        if (!project) {
          return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        // Get the request body for tags
        const body = await req.json();
        const { tags } = body;

        // Parse current generation state to get model/agent info
        let generationState: any = null;
        if (project.generationState) {
          try {
            generationState = typeof project.generationState === 'string' 
              ? JSON.parse(project.generationState) 
              : project.generationState;
          } catch (e) {
            console.error('[github-repo] Failed to parse generation state:', e);
          }
        }

        // Initialize GitHub repo metadata
        const githubMetadata: GithubRepoMetadata = {
          status: 'pending',
          startedAt: new Date().toISOString(),
        };

        // Update project with GitHub metadata
        await db
          .update(projects)
          .set({
            generationState: JSON.stringify({
              ...generationState,
              github: githubMetadata,
            }),
            updatedAt: new Date(),
          })
          .where(eq(projects.id, projectId));

        // Trigger the build with GitHub repo creation prompt
        const buildResponse = await fetch(
          `${req.nextUrl.protocol}//${req.nextUrl.host}/api/projects/${projectId}/build`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              operationType: 'element-change',
              prompt: 'Create a new GitHub repository for this project using the gh CLI. Use the default organization/user from the gh CLI configuration. Initialize it with the current project code and push the initial commit. Return the repository URL when complete.',
              tags: tags,
              buildId: generationState?.id,
            }),
          }
        );

        if (!buildResponse.ok) {
          throw new Error('Failed to start GitHub repo creation build');
        }

        // Update status to creating
        await db
          .update(projects)
          .set({
            generationState: JSON.stringify({
              ...generationState,
              github: {
                ...githubMetadata,
                status: 'creating',
              },
            }),
            updatedAt: new Date(),
          })
          .where(eq(projects.id, projectId));

        return Response.json({
          success: true,
          message: 'GitHub repository creation started',
          status: 'creating',
        });
      } catch (error) {
        console.error('[github-repo] Error:', error);
        Sentry.captureException(error);
        return Response.json(
          { error: 'Failed to create GitHub repository' },
          { status: 500 }
        );
      }
    }
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return await Sentry.startSpan(
    {
      name: 'GET /api/projects/[id]/github-repo',
      op: 'http.server',
      attributes: {
        'http.method': 'GET',
      },
    },
    async () => {
      try {
        const { id: projectId } = await params;

        // Get the project
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);

        if (!project) {
          return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        // Parse generation state to get GitHub metadata
        let githubMetadata: GithubRepoMetadata | null = null;
        if (project.generationState) {
          try {
            const generationState = typeof project.generationState === 'string'
              ? JSON.parse(project.generationState)
              : project.generationState;
            githubMetadata = generationState?.github || null;
          } catch (e) {
            console.error('[github-repo] Failed to parse generation state:', e);
          }
        }

        return Response.json({
          github: githubMetadata,
        });
      } catch (error) {
        console.error('[github-repo] Error fetching status:', error);
        Sentry.captureException(error);
        return Response.json(
          { error: 'Failed to fetch GitHub repository status' },
          { status: 500 }
        );
      }
    }
  );
}

