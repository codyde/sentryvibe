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
            Sentry.captureException(e, {
              tags: {
                operation: 'github-repo-creation',
                step: 'parse-generation-state',
              },
              extra: {
                projectId,
                projectSlug: project.slug,
              },
            });
          }
        }

        // Initialize GitHub repo metadata with timestamp to filter messages
        const startTime = new Date();
        const githubMetadata: GithubRepoMetadata = {
          status: 'pending',
          startedAt: startTime.toISOString(),
          buildId: generationState?.id, // Track the build that's creating the repo
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
          const errorText = await buildResponse.text();
          const error = new Error(`Failed to start GitHub repo creation build: ${errorText}`);
          Sentry.captureException(error, {
            tags: {
              operation: 'github-repo-creation',
              step: 'trigger-build',
            },
            extra: {
              projectId,
              projectSlug: project.slug,
              buildResponseStatus: buildResponse.status,
              buildResponseText: errorText,
            },
          });
          throw error;
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

        Sentry.addBreadcrumb({
          category: 'github-repo',
          message: 'GitHub repository creation started',
          level: 'info',
          data: {
            projectId,
            projectSlug: project.slug,
            buildId: generationState?.id,
          },
        });

        return Response.json({
          success: true,
          message: 'GitHub repository creation started',
          status: 'creating',
        });
      } catch (error) {
        console.error('[github-repo] Error:', error);
        Sentry.captureException(error, {
          tags: {
            operation: 'github-repo-creation',
            step: 'create-repo-request',
          },
          extra: {
            projectId: (await params).id,
          },
        });
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
            if (githubMetadata?.status === 'creating' && githubMetadata.startedAt) {
              // Try to fetch recent messages to look for REPO_URL
              try {
                const creationStartTime = new Date(githubMetadata.startedAt);
                console.log('[github-repo] 🔍 Checking messages for REPO_URL created after', creationStartTime.toISOString());
                
                const messagesResponse = await fetch(
                  `${req.nextUrl.protocol}//${req.nextUrl.host}/api/projects/${projectId}/messages?limit=50`,
                  { cache: 'no-store' }
                );
                
                if (!messagesResponse.ok) {
                  throw new Error(`Failed to fetch messages: ${messagesResponse.status}`);
                }
                
                const messagesData = await messagesResponse.json();
                const allMessages = messagesData.messages || [];
                
                // Filter messages to only those created AFTER the GitHub repo creation was initiated
                const messages = allMessages.filter((msg: any) => {
                  const msgTime = new Date(msg.createdAt);
                  return msgTime > creationStartTime;
                });
                
                console.log(`[github-repo] 📝 Found ${messages.length} messages created after repo creation started (${allMessages.length} total)`);
                
                // Look for REPO_URL pattern in messages created after we started
                for (let i = 0; i < messages.length; i++) {
                  const message = messages[i];
                  
                  // Handle both string content and array content
                  let contentToSearch: string = '';
                  if (typeof message.content === 'string') {
                    contentToSearch = message.content;
                  } else if (Array.isArray(message.content)) {
                    // Extract text from content blocks
                    contentToSearch = message.content
                      .filter((block: any) => block.type === 'text' && block.text)
                      .map((block: any) => block.text)
                      .join('\n');
                  }
                  
                  if (contentToSearch) {
                    console.log(`[github-repo] Checking message ${i + 1} (${message.createdAt}): ${contentToSearch.substring(0, 100)}...`);
                    
                    // Look for patterns indicating a NEW repository was created
                    // Be more strict - require context words indicating creation
                    const patterns = [
                      /REPO_URL:\s*(https:\/\/github\.com\/[^\s)]+)/i,
                      /(?:created|initialized|new)\s+repository[:\s]+(?:\[.*?\]\()?(https:\/\/github\.com\/[^\s)]+)/i,
                      /(?:repository|repo)\s+(?:url|link|created)[:\s]+(?:\[.*?\]\()?(https:\/\/github\.com\/[^\s)]+)/i,
                      /successfully\s+created[:\s]+(?:\[.*?\]\()?(https:\/\/github\.com\/[^\s)]+)/i,
                      /(?:view|visit|check out)\s+(?:the\s+)?(?:repository|repo)[:\s]+(?:\[.*?\]\()?(https:\/\/github\.com\/[^\s)]+)/i,
                    ];
                    
                    for (const pattern of patterns) {
                      const repoUrlMatch = contentToSearch.match(pattern);
                      if (repoUrlMatch) {
                        // Extract URL - could be in capture group 1 or 0
                        let repoUrl = repoUrlMatch[1] || repoUrlMatch[0];
                        
                        // If the entire match is the URL, extract just the GitHub URL part
                        if (!repoUrl.startsWith('http')) {
                          const urlMatch = repoUrl.match(/(https:\/\/github\.com\/[^\s)]+)/i);
                          if (urlMatch) {
                            repoUrl = urlMatch[1];
                          }
                        }
                        
                        // Comprehensive URL cleanup
                        repoUrl = repoUrl
                          .replace(/^[@]+/, '')                    // Remove leading @
                          .replace(/[\)\]]+$/, '')                 // Remove trailing ) or ]
                          .replace(/%22/g, '')                     // Remove URL-encoded quotes
                          .replace(/%27/g, '')                     // Remove URL-encoded single quotes
                          .replace(/["`']+$/, '')                  // Remove trailing quotes
                          .replace(/[.,;:!?]+$/, '')               // Remove trailing punctuation
                          .trim();
                        
                        // Validate it's a proper GitHub URL
                        if (!repoUrl.match(/^https:\/\/github\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/)) {
                          console.log('[github-repo] ⚠️  Invalid GitHub URL format, skipping:', repoUrl);
                          continue;
                        }
                        
                        console.log('[github-repo] ✓ Found and cleaned repo URL:', repoUrl);
                        
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
                        
                        console.log('[github-repo] ✅ Updated database with repo URL');
                        
                        Sentry.addBreadcrumb({
                          category: 'github-repo',
                          message: 'Successfully extracted GitHub repo URL',
                          level: 'info',
                          data: {
                            projectId,
                            repoUrl,
                            messageTimestamp: message.createdAt,
                          },
                        });
                        
                        break;
                      }
                    }
                    
                    if (githubMetadata.status === 'completed') break;
                  }
                }
                
                if (githubMetadata?.status !== 'completed') {
                  console.log('[github-repo] ⏳ No repo URL found yet in messages after creation start time, will check again on next poll');
                }
              } catch (parseError) {
                console.error('[github-repo] Error parsing messages for repo URL:', parseError);
                Sentry.captureException(parseError, {
                  tags: {
                    operation: 'github-repo-creation',
                    step: 'parse-repo-url',
                  },
                  extra: {
                    projectId,
                  },
                });
              }
            }
          } catch (e) {
            console.error('[github-repo] Failed to parse generation state:', e);
            Sentry.captureException(e, {
              tags: {
                operation: 'github-repo-creation',
                step: 'get-parse-generation-state',
              },
              extra: {
                projectId,
              },
            });
          }
        }

        return Response.json({
          github: githubMetadata,
        });
      } catch (error) {
        console.error('[github-repo] Error fetching status:', error);
        Sentry.captureException(error, {
          tags: {
            operation: 'github-repo-creation',
            step: 'get-status',
          },
          extra: {
            projectId: (await params).id,
          },
        });
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
            Sentry.captureException(e, {
              tags: {
                operation: 'github-repo-creation',
                step: 'patch-parse-generation-state',
              },
              extra: {
                projectId,
              },
            });
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

        Sentry.addBreadcrumb({
          category: 'github-repo',
          message: 'GitHub repository metadata updated',
          level: 'info',
          data: {
            projectId,
            status: updatedGithub.status,
            hasRepoUrl: !!updatedGithub.repoUrl,
          },
        });

        return Response.json({
          success: true,
          github: updatedGithub,
        });
      } catch (error) {
        console.error('[github-repo] Error updating status:', error);
        Sentry.captureException(error, {
          tags: {
            operation: 'github-repo-creation',
            step: 'patch-update',
          },
          extra: {
            projectId: (await params).id,
            requestedStatus: (await req.json()).status,
          },
        });
        return Response.json(
          { error: 'Failed to update GitHub repository status' },
          { status: 500 }
        );
      }
    }
  );
}

