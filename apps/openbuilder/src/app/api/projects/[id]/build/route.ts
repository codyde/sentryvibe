import { randomUUID } from 'crypto';
import type { BuildRequest } from '@/types/build';
import { sendCommandToRunner } from '@openbuilder/agent-core/lib/runner/broker-state';
import { addRunnerEventSubscriber } from '@openbuilder/agent-core/lib/runner/event-stream';
import { registerBuild, cleanupStuckBuilds } from '@openbuilder/agent-core/lib/runner/persistent-event-processor';
import type { RunnerEvent, StopDevServerCommand } from '@openbuilder/agent-core/shared/runner/messages';
import { db } from '@openbuilder/agent-core/lib/db/client';
import { sql } from 'drizzle-orm';
import {
  projects,
  messages,
  generationSessions,
} from '@openbuilder/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import { DEFAULT_AGENT_ID, DEFAULT_CLAUDE_MODEL_ID } from '@openbuilder/agent-core/types/agent';
import type { ClaudeModelId } from '@openbuilder/agent-core/types/agent';
import { analyzePromptForTemplate, generateProjectName } from '@/services/template-analysis';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Template } from '@openbuilder/agent-core/lib/templates/config';
import { parseModelTag } from '@openbuilder/agent-core/lib/tags/model-parser';
import { TAG_DEFINITIONS } from '@openbuilder/agent-core/config/tags';
import { projectEvents } from '@/lib/project-events';
import { releasePortForProject } from '@openbuilder/agent-core/lib/port-allocator';
import { getProjectRunnerId } from '@/lib/runner-utils';
import * as Sentry from '@sentry/nextjs';
import { requireProjectOwnership, AuthError } from '@/lib/auth-helpers';

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
  // Continue trace from frontend - the frontend starts the trace when user submits a build
  // This maintains the distributed tracing chain: Frontend → API → Runner → AI
  // Sentry's automatic instrumentation continues the trace from sentry-trace/baggage headers
  const sentryTraceHeader = req.headers.get('sentry-trace');
  const baggageHeader = req.headers.get('baggage');

  console.log('[build-route] Incoming trace context:', {
    hasTrace: !!sentryTraceHeader,
    tracePreview: sentryTraceHeader?.substring(0, 50),
  });

  return await Sentry.withIsolationScope(async (scope) => {
    // Create a span for this build request - it will be a child of the frontend trace
    // if trace headers are present (automatic continuation by Sentry SDK)
    return await Sentry.startSpan(
      {
        name: 'POST /api/projects/[id]/build',
        op: 'http.server.build',
        // REMOVED: forceTransaction: true - now continues trace from frontend
        attributes: {
          'http.method': 'POST',
          'http.route': '/api/projects/[id]/build',
          'trace.continued_from_frontend': !!sentryTraceHeader,
        },
      },
      async () => {
        let commandId: string | undefined;
        let cleanup: (() => void) | undefined;
        try {
          const { id } = await params;

          // Set project ID on scope for this trace
          scope.setTag('project.id', id);
          
    // Verify user owns this project
    const { project } = await requireProjectOwnership(id);
    
    const body = (await req.json()) as BuildRequest;

    if (!body?.operationType || !body?.prompt) {
      return new Response(JSON.stringify({ error: 'operationType and prompt are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    commandId = randomUUID();

    // CLEANUP: Before starting new build, check for and finalize stuck builds
    // This ensures previous builds that didn't complete properly are finalized
    // Runs naturally when users start new builds, no cronjobs needed
    // NOTE: 15 minutes of INACTIVITY (no events), not total build time
    try {
      await cleanupStuckBuilds(15); // Finalize builds inactive for 15+ minutes
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
        agentId === 'claude-code' && (body.claudeModel === 'claude-haiku-4-5' || body.claudeModel === 'claude-sonnet-4-5' || body.claudeModel === 'claude-opus-4-5')
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

    // NOTE: Server restart is now manual - user can refresh or stop/start the server
    // HMR handles most file changes automatically

    // NEW: Conditional analysis - framework tag changes behavior
    let templateMetadata = body.template; // Use provided template if available
    let generatedFriendlyName: string | undefined;

    if (body.operationType === 'initial-build' && !templateMetadata) {
      // Check if framework tag is present
      const frameworkTag = body.tags?.find(t => t.key === 'framework');

      if (frameworkTag) {
        // FAST PATH: Framework tag present - skip template analysis, only generate name
        console.log('[build-route] Framework tag present - skipping template analysis');
        console.log(`[build-route] Framework: ${frameworkTag.value}`);

        try {
          // Generate project friendly name with Haiku (fast + cheap)
          // Note: We only use the friendlyName - slug comes from DB and is immutable
          const names = await generateProjectName(body.prompt, agentId, claudeModel);
          generatedFriendlyName = names.friendlyName;
          console.log(`[build-route] ✅ Generated friendly name: ${generatedFriendlyName}`);
          console.log(`[build-route]    Using stored slug: ${project.slug}`);

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

          // Update project name and framework in DB
          // Note: We do NOT update the slug - it must remain immutable for directory consistency
          const updates: { name?: string; detectedFramework?: string } = {};
          
          if (generatedFriendlyName && generatedFriendlyName !== project.name) {
            updates.name = generatedFriendlyName;
          }
          
          // Store framework from tag for metrics consistency
          if (templateMetadata.framework) {
            updates.detectedFramework = templateMetadata.framework;
          }
          
          if (Object.keys(updates).length > 0) {
            const [updated] = await db.update(projects)
              .set(updates)
              .where(eq(projects.id, id))
              .returning();
            console.log(`[build-route] ✅ Updated project:`, updates);
            
            // EMIT FRAMEWORK EARLY: Push update to frontend immediately
            // This makes the framework tag appear at the START of the build
            if (updated) {
              console.log(`[build-route] 🚀 Framework emitted immediately: ${templateMetadata.framework}`);
              projectEvents.emitProjectUpdate(id, updated);
            }
          }
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

          // IMMEDIATE FRAMEWORK UPDATE: Save framework to DB right after template analysis
          // This happens BEFORE runner starts, making it available immediately
          if (templateMetadata?.framework) {
            const [updated] = await db.update(projects)
              .set({
                detectedFramework: templateMetadata.framework,
                lastActivityAt: new Date(),
              })
              .where(eq(projects.id, id))
              .returning();

            if (updated) {
              console.log(`[build-route] 🚀 Framework saved immediately after analysis: ${templateMetadata.framework}`);
              projectEvents.emitProjectUpdate(id, updated);
            }
          }
        } catch (analysisError) {
          console.error('[build-route] ⚠️ Template analysis failed, will fall back to runner auto-selection:', analysisError);
          // Don't fail the build - let the runner handle template selection as fallback
        }
      }
    }

    // ============================================================
    // CAPTURE BUILD START METRICS
    // ============================================================
    // Track framework and model actually used (not just what was selected)
    const frameworkTag = body.tags?.find(t => t.key === 'framework');
    Sentry.metrics.count('build.started', 1, {
      attributes: {
        project_id: id,
        model: agentId === 'claude-code' ? claudeModel : agentId,
        framework: templateMetadata?.framework || 'unknown',
        runner: runnerId,
        operation_type: body.operationType || 'initial-build',
        framework_detection_method: frameworkTag ? 'tag' : 'ai-analysis',
        has_framework_tag: String(!!frameworkTag),
      }
    });

    const encoder = new TextEncoder();

    // User message already saved by frontend via TanStack DB
    // Skip duplicate save here (hybrid approach - frontend saves user messages)

    // Update project with runnerId if not already set (for existing projects)
    if (!project.runnerId) {
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
      projectName: project.name,
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
        isAutoFix: body.isAutoFix ?? false,
        autoFixError: body.autoFixError ?? null,
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

    const KEEP_ALIVE_INTERVAL_MS = 15000;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let unsubscribe: () => void = () => {};
        let keepAliveTimer: NodeJS.Timeout | null = null;

        const finish = async () => {
          if (closed) return;
          closed = true;

          if (keepAliveTimer) {
            clearInterval(keepAliveTimer);
            keepAliveTimer = null;
          }

          // Save all completed messages to DB
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

          const normalized = normalizeSSEChunk(chunk);
          if (!normalized) return;

          controller.enqueue(encoder.encode(normalized));
        };

        const safeEnqueue = (chunk: string) => {
          writeChunk(chunk).catch((err) => {
            console.warn('[build-route] Failed to enqueue chunk', err);
          });
        };

        unsubscribe = addRunnerEventSubscriber(commandId!, async (event: RunnerEvent) => {
          switch (event.type) {
            case 'build-stream':
              if (typeof event.data === 'string') {
                await writeChunk(event.data);
              }
              break;
            case 'build-completed':
              // Build completed - server restart is now manual (user can refresh or stop/start)
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

        safeEnqueue(': runner-connected\n\n');
        keepAliveTimer = setInterval(() => {
          safeEnqueue(': keep-alive\n\n');
        }, KEEP_ALIVE_INTERVAL_MS);
      },
      cancel() {
        cleanup?.();
      },
    });

    // Load recent conversation history for enhancements and element selections
    // This gives the agent context about previous messages
    let conversationHistory: Array<{ role: string; content: string; timestamp: Date }> = [];
    if (body.operationType === 'enhancement' || body.operationType === 'focused-edit') {
      try {
        const recentMessages = await db
          .select({
            role: messages.role,
            content: messages.content,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .where(eq(messages.projectId, id))
          .orderBy(sql`${messages.createdAt} DESC`)
          .limit(10); // Last 10 messages for context

        // Helper function to extract text from content (handles both string and JSON formats)
        const extractTextContent = (rawContent: unknown): string => {
          if (!rawContent) return '';
          
          // If it's already a string, return it
          if (typeof rawContent === 'string') {
            const trimmed = rawContent.trim();
            
            // Check if it's JSON-serialized content
            if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
              try {
                const parsed = JSON.parse(trimmed);
                // If it's an array of parts, extract text
                if (Array.isArray(parsed)) {
                  return parsed
                    .filter((p: any) => p.type === 'text' && p.text)
                    .map((p: any) => p.text)
                    .join(' ');
                }
              } catch {
                // Not JSON, return as-is
                return trimmed;
              }
            }
            return trimmed;
          }
          
          // If it's already an array, extract text
          if (Array.isArray(rawContent)) {
            return rawContent
              .filter((p: any) => p.type === 'text' && p.text)
              .map((p: any) => p.text)
              .join(' ');
          }
          
          return String(rawContent);
        };

        // Reverse to get chronological order (oldest first)
        // Parse content and filter out empty messages
        conversationHistory = recentMessages
          .reverse()
          .map(m => ({
            role: m.role,
            content: extractTextContent(m.content),
            timestamp: m.createdAt || new Date(),
          }))
          .filter(m => m.content.trim().length > 0);

        const operationLabel = body.operationType === 'focused-edit' ? 'element selection' : 'enhancement';
        console.log(`[build-route] 📜 Loaded ${conversationHistory.length} messages for ${operationLabel} context`);
        
        // Log first and last messages for debugging
        if (conversationHistory.length > 0) {
          const firstPreview = conversationHistory[0].content.substring(0, 80);
          const lastPreview = conversationHistory[conversationHistory.length - 1].content.substring(0, 80);
          console.log(`[build-route]    First: "${firstPreview}${conversationHistory[0].content.length > 80 ? '...' : ''}"`);
          console.log(`[build-route]    Latest: "${lastPreview}${conversationHistory[conversationHistory.length - 1].content.length > 80 ? '...' : ''}"`);
        }
      } catch (error) {
        console.error('[build-route] Failed to load conversation history (non-fatal):', error);
        // Continue without history - not critical
      }
    }

    // Log template being sent to runner
    if (templateMetadata) {
      console.log('[build-route] 📤 Sending template to runner:', templateMetadata.name);
      console.log(`[build-route]    ID: ${templateMetadata.id}`);
      console.log(`[build-route]    Framework: ${templateMetadata.framework}`);
      console.log(`[build-route]    Project Slug: ${project.slug} (immutable, from database)`);
      if (generatedFriendlyName) {
        console.log(`[build-route]    Display Name: ${generatedFriendlyName}`);
      }

      // EMIT FRAMEWORK EARLY: Update project with detected framework immediately
      // This makes the framework tag appear at the START of the build
      try {
        const [updated] = await db.update(projects)
          .set({
            detectedFramework: templateMetadata.framework,
            lastActivityAt: new Date(),
          })
          .where(eq(projects.id, id))
          .returning();

        if (updated) {
          console.log(`[build-route] ✅ Early framework emit: ${templateMetadata.framework}`);
          projectEvents.emitProjectUpdate(id, updated);
        }
      } catch (error) {
        console.error('[build-route] Failed to emit early framework:', error);
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
        sessionId, // Pass sessionId to runner for event correlation
        operationType: body.operationType,
        prompt: body.prompt,
        messageParts: body.messageParts,
        // CRITICAL: Always use the stored slug from database
        // The slug is generated once during project creation and must be immutable
        // Using a regenerated slug causes directory mismatch between initial build and enhancements
        projectSlug: project.slug,
        projectName: generatedFriendlyName || project.name,
        context: body.context,
        designPreferences: body.designPreferences,
        tags: body.tags,
        agent: agentId,
        claudeModel: agentId === 'claude-code' ? claudeModel : undefined,
        template: templateMetadata,
        codexThreadId: body.codexThreadId,
        conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
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

          // Handle auth errors (401, 403, 404)
          if (error instanceof AuthError) {
            return new Response(JSON.stringify({ error: error.message }), {
              status: error.statusCode,
              headers: { 'Content-Type': 'application/json' },
            });
          }

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
    ); // close startSpan
  }); // close withIsolationScope
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
