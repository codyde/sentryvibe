import { randomUUID } from 'crypto';
import type { BuildRequest } from '@/types/build';
import { sendCommandToRunner } from '@sentryvibe/agent-core/lib/runner/broker-state';
import { addRunnerEventSubscriber } from '@sentryvibe/agent-core/lib/runner/event-stream';
import { registerBuild, cleanupStuckBuilds } from '@sentryvibe/agent-core/lib/runner/persistent-event-processor';
import type { RunnerEvent } from '@/shared/runner/messages';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import {
  projects,
  messages,
  generationSessions,
} from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import { DEFAULT_AGENT_ID, DEFAULT_CLAUDE_MODEL_ID } from '@sentryvibe/agent-core/types/agent';
import type { ClaudeModelId } from '@sentryvibe/agent-core/types/agent';
import { analyzePromptForTemplate, generateProjectName } from '@/services/template-analysis';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Template } from '@sentryvibe/agent-core/lib/templates/config';
import { parseModelTag } from '@sentryvibe/agent-core/lib/tags/model-parser';
import { TAG_DEFINITIONS } from '@sentryvibe/agent-core/config/tags';

export const maxDuration = 30;

interface TemplateConfig {
  version: string;
  templates: Template[];
}

async function loadTemplates(): Promise<Template[]> {
  const templatesPath = join(process.cwd(), 'templates.json');
  const content = await readFile(templatesPath, 'utf-8');
  const config: TemplateConfig = JSON.parse(content);
  return config.templates;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let commandId: string | undefined;
  let cleanup: (() => void) | undefined;
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

    // CLEANUP: Before starting new build, check for and finalize stuck builds
    // This ensures previous builds that didn't complete properly are finalized
    // Runs naturally when users start new builds, no cronjobs needed
    try {
      await cleanupStuckBuilds(5); // Finalize builds inactive for 5+ minutes
    } catch (cleanupError) {
      // Don't block the new build if cleanup fails
      console.error('[build-route] Cleanup failed (non-fatal):', cleanupError);
    }

    // PRIORITY 1: Extract model from tags if present (tags take precedence)
    let agentId = body.agent ?? DEFAULT_AGENT_ID;
    let claudeModel: ClaudeModelId = DEFAULT_CLAUDE_MODEL_ID;

    if (body.tags && body.tags.length > 0) {
      const modelTag = body.tags.find(t => t.key === 'model');
      if (modelTag) {
        const parsed = parseModelTag(modelTag.value);
        agentId = parsed.agent; // 'claude-code' or 'openai-codex'
        if (agentId === 'claude-code' && parsed.claudeModel) {
          claudeModel = parsed.claudeModel as ClaudeModelId;
        }
        console.log('[build-route] ✓ Model enforced from tags:', agentId, agentId === 'claude-code' ? claudeModel : '');
      }
    } else {
      // Fallback to body parameters if no model tag
      claudeModel =
        agentId === 'claude-code' && (body.claudeModel === 'claude-haiku-4-5' || body.claudeModel === 'claude-sonnet-4-5')
          ? body.claudeModel
          : DEFAULT_CLAUDE_MODEL_ID;
    }

    // PRIORITY 2: Extract runner from tags if present (tags take precedence)
    let runnerId = body.runnerId || process.env.RUNNER_DEFAULT_ID || 'default';
    if (body.tags && body.tags.length > 0) {
      const runnerTag = body.tags.find(t => t.key === 'runner');
      if (runnerTag) {
        runnerId = runnerTag.value;
        console.log('[build-route] ✓ Runner enforced from tags:', runnerId);
      }
    }

    console.log('[build-route] Using agent for build:', agentId);
    if (agentId === 'claude-code') {
      console.log('[build-route] Claude model selected:', claudeModel);
    }

    // NEW: Conditional analysis - framework tag changes behavior
    let templateMetadata = body.template; // Use provided template if available
    let generatedSlug: string | undefined;
    let generatedFriendlyName: string | undefined;

    if (body.operationType === 'initial-build' && !templateMetadata) {
      // Check if framework tag is present
      const frameworkTag = body.tags?.find(t => t.key === 'framework');

      if (frameworkTag) {
        // FAST PATH: Framework tag present - skip template analysis, only generate name
        console.log('[build-route] Framework tag present - skipping template analysis');
        console.log(`[build-route] Framework: ${frameworkTag.value}`);

        try {
          // Generate project names with Haiku (fast + cheap)
          const names = await generateProjectName(body.prompt, agentId, claudeModel);
          generatedSlug = names.slug;
          generatedFriendlyName = names.friendlyName;
          console.log(`[build-route] ✅ Project slug: ${generatedSlug}`);
          console.log(`[build-route] ✅ Friendly name: ${generatedFriendlyName}`);

          // Get framework metadata from tag definition
          const frameworkDef = TAG_DEFINITIONS.find(d => d.key === 'framework');
          const frameworkOption = frameworkDef?.options?.find(o => o.value === frameworkTag.value);

          if (!frameworkOption?.repository) {
            throw new Error(`Framework tag ${frameworkTag.value} missing repository metadata`);
          }

          // Build template metadata from tag (no AI analysis needed)
          templateMetadata = {
            id: `${frameworkTag.value}-default`,
            name: frameworkOption.label,
            framework: frameworkTag.value,
            port: 3000,
            runCommand: 'pnpm dev',
            repository: frameworkOption.repository,
            branch: frameworkOption.branch || 'main',
          };

          console.log(`[build-route] ✅ Template from tag: ${frameworkOption.label}`);
          console.log(`[build-route]    Repository: ${frameworkOption.repository}`);
          console.log(`[build-route]    Cost savings: ~85% (skipped template analysis)`);
        } catch (error) {
          console.error('[build-route] ⚠️ Framework tag processing failed:', error);
          throw error; // Don't fall back - tag enforcement should work
        }
      } else {
        // FULL PATH: No framework tag - run complete template analysis
        console.log('[build-route] No framework tag - running full template analysis');
        console.log(`[build-route] Using ${agentId} model for analysis`);

        try {
          const templates = await loadTemplates();
          const analysis = await analyzePromptForTemplate(body.prompt, agentId, templates, claudeModel);

          templateMetadata = {
            id: analysis.templateId,
            name: analysis.templateName,
            framework: analysis.framework,
            port: analysis.defaultPort,
            runCommand: analysis.devCommand,
            repository: analysis.repository,
            branch: analysis.branch,
          };

          console.log(`[build-route] ✅ Template selected: ${analysis.templateName}`);
          console.log(`[build-route]    Reasoning: ${analysis.reasoning}`);
          console.log(`[build-route]    Confidence: ${analysis.confidence}`);
          console.log(`[build-route]    Analyzed by: ${analysis.analyzedBy}`);
        } catch (analysisError) {
          console.error('[build-route] ⚠️ Template analysis failed, will fall back to runner auto-selection:', analysisError);
          // Don't fail the build - let the runner handle template selection as fallback
        }
      }
    }

    const encoder = new TextEncoder();

    // Track messages for DB persistence (legacy chat transcript)
    let currentMessageParts: Array<{type: string; id?: string; text?: string; toolCallId?: string; toolName?: string; input?: unknown; output?: unknown; state?: string}> = [];
    let currentMessageId: string | null = null;
    const completedMessages: Array<{role: 'assistant'; content: Array<{type: string; id?: string; text?: string; toolCallId?: string; toolName?: string; input?: unknown; output?: unknown; state?: string}>}> = [];

    // Save user message first
    await db.insert(messages).values({
      projectId: id,
      role: 'user',
      content: JSON.stringify([{ type: 'text', text: body.prompt }]),
    });

    // Update project with runnerId if not already set (for existing projects)
    if (!project[0].runnerId) {
      await db.update(projects)
        .set({ runnerId: runnerId })
        .where(eq(projects.id, id));
    }

    const buildId = body.buildId ?? `build-${Date.now()}`;

    const existingSession = await db
      .select()
      .from(generationSessions)
      .where(eq(generationSessions.buildId, buildId))
      .limit(1);

    const now = new Date();
    let sessionId: string;

    // Create initial raw state with agent information
    const initialRawState = JSON.stringify({
      id: buildId,
      projectId: id,
      projectName: project[0].name,
      operationType: body.operationType,
      agentId,
      claudeModelId: agentId === 'claude-code' ? claudeModel : undefined,
      todos: [],
      toolsByTodo: {},
      textByTodo: {},
      activeTodoIndex: -1,
      isActive: true,
      startTime: now.toISOString(),
    });

    if (existingSession.length > 0) {
      sessionId = existingSession[0].id;
      
      // Merge agent info into existing rawState if it exists
      let updatedRawState = initialRawState;
      if (existingSession[0].rawState) {
        try {
          const existingState = typeof existingSession[0].rawState === 'string' 
            ? JSON.parse(existingSession[0].rawState)
            : existingSession[0].rawState;
          
          // Merge agent info into existing state
          const mergedState = {
            ...existingState,
            agentId,
            claudeModelId: agentId === 'claude-code' ? claudeModel : undefined,
          };
          updatedRawState = JSON.stringify(mergedState);
        } catch (error) {
          console.error('[build-route] Failed to parse existing rawState, using initial:', error);
        }
      }
      
      // Update existing session with merged rawState
      await db.update(generationSessions)
        .set({
          projectId: id,
          operationType: body.operationType ?? existingSession[0].operationType,
          status: 'active',
          startedAt: existingSession[0].startedAt ?? now,
          updatedAt: now,
          rawState: updatedRawState,
        })
        .where(eq(generationSessions.id, sessionId));
    } else {
      const inserted = await db.insert(generationSessions).values({
        projectId: id,
        buildId,
        operationType: body.operationType,
        status: 'active',
        startedAt: now,
        updatedAt: now,
        rawState: initialRawState,
      }).returning();
      sessionId = inserted[0].id;
    }

    // Register build with persistent processor
    // This ensures database updates continue even if HTTP connection is lost
    const persistentCleanup = registerBuild(
      commandId,
      sessionId,
      id,
      buildId,
      agentId,
      agentId === 'claude-code' ? claudeModel : undefined
    );
    console.log('[build-route] ✅ Registered build with persistent processor');
    console.log(`[build-route]    Agent: ${agentId}${agentId === 'claude-code' ? ` (${claudeModel})` : ''}`);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let unsubscribe: () => void = () => {};

        const finish = async () => {
          if (closed) return;
          closed = true;

          // Save all completed messages to DB (legacy chat transcript)
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

          // Unsubscribe from SSE stream (persistent processor continues independently)
          unsubscribe();
          console.log('[build-route] 🔌 SSE stream closed, persistent processor continues');

          // Safely close controller - it may already be closed
          try {
            controller.close();
          } catch (err) {
            // Controller already closed - this is fine
            const error = err as { code?: string };
            if (error.code !== 'ERR_INVALID_STATE') {
              console.warn('[build-route] Unexpected error closing controller:', err);
            }
          }
        };

        const writeChunk = async (chunk: string) => {
          if (closed) return;
          if (!chunk) return;

          // Parse events to track messages for legacy chat transcript
          try {
            const match = chunk.match(/data:\s*({.*})/);
            if (match) {
              const eventData = JSON.parse(match[1]);

              // Track message lifecycle for legacy chat transcript only
              if (eventData.type === 'start') {
                if (currentMessageId && currentMessageParts.length > 0) {
                  completedMessages.push({
                    role: 'assistant',
                    content: [...currentMessageParts],
                  });
                }
                currentMessageId = eventData.messageId;
                currentMessageParts = [];
              } else if (eventData.type === 'text-delta' && currentMessageId) {
                const existing = currentMessageParts.find(p => p.type === 'text' && !p.id);
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
                  state: 'input-available',
                });
              } else if (eventData.type === 'tool-output-available') {
                const toolPart = currentMessageParts.find(p => p.toolCallId === eventData.toolCallId);
                if (toolPart) {
                  toolPart.output = eventData.output;
                  toolPart.state = 'output-available';
                }
              } else if (eventData.type === 'finish') {
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
            console.warn('[build-route] Failed to parse SSE event (non-fatal):', e);
            // Continue processing even if one event fails to parse
          }

          if (closed) return;

          const normalized = normalizeSSEChunk(chunk);
          if (!normalized) return;

          controller.enqueue(encoder.encode(normalized));
        };

        unsubscribe = addRunnerEventSubscriber(commandId!, async (event: RunnerEvent) => {
          switch (event.type) {
            case 'build-stream':
              if (typeof event.data === 'string') {
                await writeChunk(event.data);
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

        cleanup = finish;

        writeChunk(': runner-connected\n\n');
      },
      cancel() {
        cleanup?.();
      },
    });

    // Log template being sent to runner
    if (templateMetadata) {
      console.log('[build-route] 📤 Sending template to runner:', templateMetadata.name);
      console.log(`[build-route]    ID: ${templateMetadata.id}`);
      console.log(`[build-route]    Framework: ${templateMetadata.framework}`);
      if (generatedSlug) {
        console.log(`[build-route]    Project Slug: ${generatedSlug} (for directory)`);
        console.log(`[build-route]    Friendly Name: ${generatedFriendlyName} (for display)`);
      }
    } else {
      console.log('[build-route] 📤 No template metadata - runner will auto-select');
    }

    await sendCommandToRunner(runnerId, {
      id: commandId,
      type: 'start-build',
      projectId: id,
      timestamp: new Date().toISOString(),
      payload: {
        operationType: body.operationType,
        prompt: body.prompt,
        projectSlug: generatedSlug || project[0].slug,
        projectName: generatedFriendlyName || generatedSlug || project[0].name,
        context: body.context,
        designPreferences: body.designPreferences,
        tags: body.tags,
        agent: agentId,
        claudeModel: agentId === 'claude-code' ? claudeModel : undefined,
        template: templateMetadata,
        codexThreadId: body.codexThreadId, 
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
