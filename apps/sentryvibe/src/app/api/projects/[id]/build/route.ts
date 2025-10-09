import { randomUUID } from 'crypto';
import type { BuildRequest } from '@/types/build';
import { sendCommandToRunner } from '@/lib/runner/broker-state';
import { addRunnerEventSubscriber } from '@/lib/runner/event-stream';
import type { RunnerEvent } from '@/shared/runner/messages';
import { db } from '@/lib/db/client';
import { messages, projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const maxDuration = 30;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let commandId: string | undefined;
  let cleanup: (() => void) | null = null;
  try {
    const { id } = await params;
    const body = (await req.json()) as BuildRequest;

    if (!body?.operationType || !body?.prompt) {
      return new Response(JSON.stringify({ error: 'operationType and prompt are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get project details for slug
    const project = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (project.length === 0) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    commandId = randomUUID();
    const runnerId = process.env.RUNNER_DEFAULT_ID ?? 'default';
    const encoder = new TextEncoder();

    // Track messages for DB persistence
    let currentMessageParts: Array<{type: string; text?: string; toolCallId?: string; toolName?: string; input?: unknown; output?: unknown}> = [];
    let currentMessageId: string | null = null;
    const completedMessages: Array<{role: 'assistant'; content: any[]}> = [];

    // Save user message first
    await db.insert(messages).values({
      projectId: id,
      role: 'user',
      content: JSON.stringify([{ type: 'text', text: body.prompt }]),
    });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;

        const writeChunk = (chunk: string) => {
          if (closed) return;
          try {
            // helpful debug output to inspect raw SSE payloads
            console.log('[build-route] streaming chunk', chunk.slice(0, 200));
            if (chunk.includes('TodoWrite')) {
              console.log('[build-route] chunk contains TodoWrite');
            }
          } catch {
            // ignore logging issues
          }
          if (!chunk) return;

          // Parse events to track messages for DB
          try {
            const match = chunk.match(/data:\s*({.*})/);
            if (match) {
              const eventData = JSON.parse(match[1]);

              // Track message lifecycle
              if (eventData.type === 'start') {
                // Save previous message if exists
                if (currentMessageId && currentMessageParts.length > 0) {
                  completedMessages.push({
                    role: 'assistant',
                    content: [...currentMessageParts],
                  });
                }
                currentMessageId = eventData.messageId;
                currentMessageParts = [];
              } else if (eventData.type === 'text-delta' && currentMessageId) {
                // Accumulate text
                const existing = currentMessageParts.find(p => p.type === 'text');
                if (existing && 'text' in existing) {
                  existing.text = (existing.text || '') + (eventData.delta || '');
                } else {
                  currentMessageParts.push({ type: 'text', text: eventData.delta || '' });
                }
              } else if (eventData.type === 'tool-input-available' && eventData.toolName !== 'TodoWrite') {
                currentMessageParts.push({
                  type: `tool-${eventData.toolName}`,
                  toolCallId: eventData.toolCallId,
                  toolName: eventData.toolName,
                  input: eventData.input,
                });
              } else if (eventData.type === 'tool-output-available') {
                const toolPart = currentMessageParts.find(p => p.toolCallId === eventData.toolCallId);
                if (toolPart) {
                  toolPart.output = eventData.output;
                }
              } else if (eventData.type === 'finish') {
                // Save final message
                if (currentMessageId && currentMessageParts.length > 0) {
                  completedMessages.push({
                    role: 'assistant',
                    content: [...currentMessageParts],
                  });
                  currentMessageId = null;
                  currentMessageParts = [];
                }
              }
            }
          } catch (e) {
            // Ignore parsing errors for message tracking
          }

          const normalized = normalizeSSEChunk(chunk);
          if (!normalized) return;

          controller.enqueue(encoder.encode(normalized));
        };

        const unsubscribe = addRunnerEventSubscriber(commandId, (event: RunnerEvent) => {
          switch (event.type) {
            case 'build-stream':
              if (typeof event.data === 'string') {
                writeChunk(event.data);
              }
              break;
            case 'build-completed':
              finish();
              break;
            case 'build-failed': {
              const errorPayload = `data: ${JSON.stringify({ type: 'error', error: event.error })}\n\n`;
              writeChunk(errorPayload);
              writeChunk('data: [DONE]\n\n');
              finish();
              break;
            }
            case 'error': {
              const errorPayload = `data: ${JSON.stringify({ type: 'error', error: event.error })}\n\n`;
              writeChunk(errorPayload);
              writeChunk('data: [DONE]\n\n');
              finish();
              break;
            }
            default:
              break;
          }
        });

        const finish = async () => {
          if (closed) return;
          closed = true;

          // Save all completed messages to DB
          for (const msg of completedMessages) {
            try {
              await db.insert(messages).values({
                projectId: id,
                role: msg.role,
                content: JSON.stringify(msg.content),
              });
            } catch (error) {
              console.error('[build-route] Failed to save message:', error);
            }
          }

          console.log(`[build-route] Saved ${completedMessages.length} messages to DB`);

          unsubscribe();
          controller.close();
        };

        cleanup = finish;

        writeChunk(': runner-connected\n\n');
      },
      cancel() {
        cleanup?.();
      },
    });

    await sendCommandToRunner(runnerId, {
      id: commandId,
      type: 'start-build',
      projectId: id,
      timestamp: new Date().toISOString(),
      payload: {
        operationType: body.operationType,
        prompt: body.prompt,
        projectSlug: project[0].slug,
        projectName: project[0].name,
        context: body.context,
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error) {
    console.error('❌ Build request failed:', error);

    cleanup?.();

    if (error instanceof Error && /not connected/i.test(error.message)) {
      return new Response(JSON.stringify({ error: 'Runner is not connected' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Build failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function normalizeSSEChunk(chunk: string): string | null {
  const sanitized = chunk.replace(/\r\n/g, '\n');
  const lines = sanitized.split('\n');

  let hasContent = false;
  const normalizedLines = lines.map((line) => {
    if (line.trim().length === 0) {
      return '';
    }

    hasContent = true;

    if (line.startsWith('data:') || line.startsWith(':')) {
      return line;
    }

    return `data: ${line}`;
  });

  if (!hasContent) {
    return null;
  }

  let normalized = normalizedLines.join('\n');

  // Ensure trailing double newline per SSE framing
  if (!normalized.endsWith('\n\n')) {
    normalized = normalized.replace(/\n*$/, '');
    normalized += '\n\n';
  }

  return normalized;
}
