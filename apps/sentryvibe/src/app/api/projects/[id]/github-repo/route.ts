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
              prompt: `Create a new GitHub repository for this project using the gh CLI with these requirements:
1. Use the gh CLI to create a new repository in the default organization/user
2. Name the repository based on the project name (${project.slug})
3. Initialize it as a public repository
4. Add all current project files to git (if not already initialized)
5. Create an initial commit with message "Initial commit from SentryVibe"
6. Push the code to the new GitHub repository
7. IMPORTANT: At the end, output the repository URL in this exact format: "REPO_URL: https://github.com/username/repo-name"

Execute these steps and return the repository URL.`,
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
        let generationState: any = null;
        
        if (project.generationState) {
          try {
            generationState = typeof project.generationState === 'string'
              ? JSON.parse(project.generationState)
              : project.generationState;
            githubMetadata = generationState?.github || null;
            
            // If status is creating, try to parse logs for the repo URL
            if (githubMetadata?.status === 'creating') {
              // Try to fetch recent messages to look for REPO_URL
              try {
                const messagesResponse = await fetch(
                  `${req.nextUrl.protocol}//${req.nextUrl.host}/api/projects/${projectId}/messages?limit=20`,
                  { cache: 'no-store' }
                );
                
                if (messagesResponse.ok) {
                  const messagesData = await messagesResponse.json();
                  const messages = messagesData.messages || [];
                  
                  // Look for REPO_URL pattern in messages
                  for (const message of messages) {
                    if (message.content && typeof message.content === 'string') {
                      const repoUrlMatch = message.content.match(/REPO_URL:\s*(https:\/\/github\.com\/[^\s]+)/i);
                      if (repoUrlMatch) {
                        const repoUrl = repoUrlMatch[1];
                        
                        // Update the GitHub metadata with the repo URL
                        githubMetadata = {
                          ...githubMetadata,
                          status: 'completed',
                          repoUrl: repoUrl,
                          completedAt: new Date().toISOString(),
                        };
                        
                        // Update in database
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
                        
                        console.log('[github-repo] ✓ Extracted repo URL from messages:', repoUrl);
                        break;
                      }
                    }
                  }
                }
              } catch (parseError) {
                console.error('[github-repo] Error parsing messages for repo URL:', parseError);
              }
            }
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return await Sentry.startSpan(
    {
      name: 'PATCH /api/projects/[id]/github-repo',
      op: 'http.server',
      attributes: {
        'http.method': 'PATCH',
      },
    },
    async () => {
      try {
        const { id: projectId } = await params;
        const body = await req.json();
        const { repoUrl, status } = body;

        // Get the project
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);

        if (!project) {
          return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        // Parse generation state
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

        const existingGithub = generationState?.github || {};
        
        // Update GitHub metadata
        const updatedGithub: GithubRepoMetadata = {
          ...existingGithub,
          ...(status && { status }),
          ...(repoUrl && { repoUrl }),
          ...(status === 'completed' && { completedAt: new Date().toISOString() }),
          ...(status === 'failed' && { error: body.error || 'Unknown error' }),
        };

        // Update in database
        await db
          .update(projects)
          .set({
            generationState: JSON.stringify({
              ...generationState,
              github: updatedGithub,
            }),
            updatedAt: new Date(),
          })
          .where(eq(projects.id, projectId));

        return Response.json({
          success: true,
          github: updatedGithub,
        });
      } catch (error) {
        console.error('[github-repo] Error updating status:', error);
        Sentry.captureException(error);
        return Response.json(
          { error: 'Failed to update GitHub repository status' },
          { status: 500 }
        );
      }
    }
  );
}

