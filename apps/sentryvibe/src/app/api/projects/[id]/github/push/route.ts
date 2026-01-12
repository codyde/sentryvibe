import { NextResponse } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { projects } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireProjectOwnership, handleAuthError } from '@/lib/auth-helpers';
import { sendCommandToRunner } from '@sentryvibe/agent-core/lib/runner/broker-state';
import { getProjectRunnerId } from '@/lib/runner-utils';
import { randomUUID } from 'crypto';

/**
 * POST /api/projects/:id/github/push
 * Trigger a push operation to GitHub
 * This sends a command to the runner to execute git push
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Verify user owns this project
    const { project } = await requireProjectOwnership(id);

    // Check if GitHub is connected
    if (!project.githubRepo) {
      return NextResponse.json({ 
        error: 'GitHub is not connected to this project. Set up GitHub first.' 
      }, { status: 400 });
    }

    // Parse optional commit message from body
    const body = await req.json().catch(() => ({}));
    const commitMessage = body.message || 'Update from SentryVibe';

    // Get runner for this project
    const runnerId = await getProjectRunnerId(project.runnerId);
    
    if (!runnerId) {
      return NextResponse.json({ 
        error: 'No runner available. Please ensure a runner is connected.' 
      }, { status: 503 });
    }

    // Send push command to runner
    const commandId = randomUUID();
    
    try {
      await sendCommandToRunner(runnerId, {
        id: commandId,
        type: 'github-push',
        projectId: id,
        timestamp: new Date().toISOString(),
        payload: {
          slug: project.slug,
          commitMessage,
          repo: project.githubRepo,
          branch: project.githubBranch || 'main',
        },
      });

      return NextResponse.json({ 
        success: true,
        message: 'Push command sent to runner',
        commandId,
      });
    } catch (sendError) {
      console.error('Failed to send push command to runner:', sendError);
      return NextResponse.json({ 
        error: 'Failed to communicate with runner' 
      }, { status: 503 });
    }
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    
    console.error('Error initiating GitHub push:', error);
    return NextResponse.json({ error: 'Failed to initiate push' }, { status: 500 });
  }
}
