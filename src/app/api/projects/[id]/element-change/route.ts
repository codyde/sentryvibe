import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const query = Sentry.createInstrumentedClaudeQuery();

/**
 * Parallel element change using Claude Code Agent
 * Runs independently of main chat for non-blocking edits
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { elementSelector, changeRequest, elementInfo } = await req.json();

    console.log('⚡ Element change request:', { elementSelector, changeRequest });

    // Get project
    const project = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project[0]) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const proj = project[0];

    // Create focused prompt for the element change
    const focusedPrompt = `You need to make a targeted change to a specific element.

Element selector: ${elementSelector}
Element tag: <${elementInfo?.tagName || 'unknown'}>
${elementInfo?.className ? `Element classes: ${elementInfo.className}` : ''}
${elementInfo?.textContent ? `Element text: "${elementInfo.textContent.substring(0, 100)}"` : ''}

Change request: ${changeRequest}

Instructions:
1. Find the element in the codebase using the selector information above
2. Make ONLY the requested change to that specific element
3. Do not modify other parts of the code
4. Verify the change is complete

Be precise and focused - this is a targeted element change, not a full feature.`;

    // Run agent in focused mode (low max turns for speed)
    const agentStream = query({
      prompt: focusedPrompt,
      inputMessages: [],
      options: {
        model: 'claude-sonnet-4-5',
        cwd: proj.path,
        permissionMode: 'bypassPermissions',
        maxTurns: 10, // Limited turns for speed
        systemPrompt: `You are making a focused, targeted change to a single UI element.
Work quickly and precisely. Do not make unnecessary changes.
Focus only on the requested element change.`,
      },
    });

    // Stream the response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const message of agentStream) {
            // Send progress updates
            const data = JSON.stringify(message) + '\n';
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('❌ Element change error:', error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('❌ Element change failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to process element change',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
