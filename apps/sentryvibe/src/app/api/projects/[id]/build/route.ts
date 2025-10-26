import { randomUUID } from 'crypto';
import type { BuildRequest } from '@/types/build';
import { sendCommandToRunner } from '@sentryvibe/agent-core/lib/runner/broker-state';
import { addRunnerEventSubscriber } from '@sentryvibe/agent-core/lib/runner/event-stream';
import type { RunnerEvent } from '@/shared/runner/messages';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import {
  projects,
  messages,
  generationSessions,
  generationTodos,
  generationToolCalls,
  generationNotes,
} from '@sentryvibe/agent-core/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { TodoItem, ToolCall, GenerationState, TextMessage } from '@sentryvibe/agent-core/types/generation';
import { serializeGenerationState } from '@sentryvibe/agent-core/lib/generation-persistence';
import { DEFAULT_AGENT_ID, DEFAULT_CLAUDE_MODEL_ID } from '@sentryvibe/agent-core/types/agent';
import type { ClaudeModelId } from '@sentryvibe/agent-core/types/agent';
import { analyzePromptForTemplate, generateProjectName } from '@/services/template-analysis';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Template } from '@sentryvibe/agent-core/lib/templates/config';
import { parseModelTag } from '@sentryvibe/agent-core/lib/tags/model-parser';
import { TAG_DEFINITIONS } from '@sentryvibe/agent-core/config/tags';

async function retryOnTimeout<T>(fn: () => Promise<T>, retries = 5): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const err = error as { code?: string; errno?: number; message?: string };
      const isTimeout = err?.code === 'ETIMEDOUT' || err?.errno === -60 || err?.message?.includes('timeout');
      const isLastAttempt = attempt === retries;

      if (isTimeout && !isLastAttempt) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Exponential backoff, max 5s
        console.warn(`[build-route] DB timeout on attempt ${attempt + 1}/${retries}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!isTimeout || isLastAttempt) {
        console.error(`[build-route] DB operation failed after ${attempt + 1} attempts:`, err?.message || error);
        throw error;
      }
    }
  }
  return null;
}

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

    // Track messages for DB persistence
    let currentMessageParts: Array<{type: string; id?: string; text?: string; toolCallId?: string; toolName?: string; input?: unknown; output?: unknown; state?: string}> = [];
    let currentMessageId: string | null = null;
    const completedMessages: Array<{role: 'assistant'; content: Array<{type: string; id?: string; text?: string; toolCallId?: string; toolName?: string; input?: unknown; output?: unknown; state?: string}>}> = [];

    // Map toolCallId to toolName for output events that don't include toolName
    const toolCallNameMap = new Map<string, string>();

    // Track active todo index to associate tools/text with todos
    let currentActiveTodoIndex = -1;

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

    if (existingSession.length > 0) {
      sessionId = existingSession[0].id;
      await db.update(generationSessions)
        .set({
          projectId: id,
          operationType: body.operationType ?? existingSession[0].operationType,
          status: 'active',
          startedAt: existingSession[0].startedAt ?? now,
          updatedAt: now,
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
      }).returning();
      sessionId = inserted[0].id;
    }

    const buildSnapshot = async (): Promise<GenerationState> => {
      const [sessionRow] = await db
        .select()
        .from(generationSessions)
        .where(eq(generationSessions.id, sessionId))
        .limit(1);

      if (!sessionRow) {
        throw new Error('Generation session not found when building snapshot');
      }

      const todoRows = await db
        .select()
        .from(generationTodos)
        .where(eq(generationTodos.sessionId, sessionId))
        .orderBy(generationTodos.todoIndex);

      const toolRows = await db
        .select()
        .from(generationToolCalls)
        .where(eq(generationToolCalls.sessionId, sessionId));

      const noteRows = await db
        .select()
        .from(generationNotes)
        .where(eq(generationNotes.sessionId, sessionId))
        .orderBy(generationNotes.createdAt);

      const todosSnapshot: TodoItem[] = todoRows.map(row => ({
        content: row.content,
        status: (row.status as TodoItem['status']) ?? 'pending',
        activeForm: row.activeForm ?? row.content,
      }));

      const toolsByTodo: Record<number, ToolCall[]> = {};
      toolRows.forEach(tool => {
        const index = tool.todoIndex ?? -1;
        if (index < 0) return;
        if (!toolsByTodo[index]) {
          toolsByTodo[index] = [];
        }
        toolsByTodo[index].push({
          id: tool.toolCallId ?? tool.id,
          name: tool.name,
          input: tool.input ?? undefined,
          output: tool.output ?? undefined,
          state: tool.state as ToolCall['state'],
          startTime: tool.startedAt ?? sessionRow.startedAt ?? new Date(),
          endTime: tool.endedAt ?? undefined,
        });
      });

      const textByTodo: Record<number, TextMessage[]> = {};
      noteRows.forEach(note => {
        const index = note.todoIndex ?? -1;
        if (index < 0) return;
        if (!textByTodo[index]) {
          textByTodo[index] = [];
        }
        textByTodo[index].push({
          id: note.textId ?? note.id,
          text: note.content,
          timestamp: note.createdAt ?? new Date(),
        });
      });

      const activeIndex = todoRows.findIndex(row => row.status === 'in_progress');

      let persistedState: Record<string, unknown> | null = null;
      if (sessionRow.rawState) {
        if (typeof sessionRow.rawState === 'string') {
          try {
            persistedState = JSON.parse(sessionRow.rawState) as Record<string, unknown>;
          } catch (parseError) {
            console.warn('[build-route] Failed to parse rawState JSON:', parseError);
          }
        } else {
          persistedState = sessionRow.rawState as Record<string, unknown>;
        }
      }

      const snapshot: GenerationState = {
        id: sessionRow.buildId,
        projectId: sessionRow.projectId,
        projectName: project[0].name,
        operationType: (sessionRow.operationType ?? body.operationType) as GenerationState['operationType'],
        agentId: (persistedState?.agentId as GenerationState['agentId']) ?? agentId,
        claudeModelId:
          (persistedState?.claudeModelId as GenerationState['claudeModelId']) ??
          (agentId === 'claude-code' ? claudeModel : undefined),
        todos: todosSnapshot,
        toolsByTodo,
        textByTodo,
        activeTodoIndex: activeIndex,
        isActive: sessionRow.status === 'active',
        startTime: sessionRow.startedAt ?? now,
        endTime: sessionRow.endedAt ?? undefined,
        codex: persistedState?.codex as GenerationState['codex'],
      };

      return snapshot;
    };

    const refreshRawState = async () => {
      try {
        const snapshot = await buildSnapshot();
        const serialized = serializeGenerationState(snapshot);
        await db.update(generationSessions)
          .set({ rawState: serialized, updatedAt: new Date() })
          .where(eq(generationSessions.id, sessionId));
      } catch (snapshotError) {
        console.warn('[build-route] Failed to refresh raw generation state:', snapshotError);
      }
    };

    const finalizeSession = async (status: 'completed' | 'failed', timestamp: Date) => {
      await retryOnTimeout(() =>
        db.update(generationSessions)
          .set({ status, endedAt: timestamp, updatedAt: timestamp })
          .where(eq(generationSessions.id, sessionId))
      );
      await refreshRawState();
    };

    const persistTodo = async (todo: { content?: string; activeForm?: string; status?: string }, index: number) => {
      const content = todo?.content ?? todo?.activeForm ?? 'Untitled task';
      const activeForm = todo?.activeForm ?? null;
      const status = todo?.status ?? 'pending';
      const timestamp = new Date();

      // Wrap in retry logic for DB timeouts
      await retryOnTimeout(() =>
        db.insert(generationTodos).values({
          sessionId,
          todoIndex: index,
          content,
          activeForm,
          status,
          createdAt: timestamp,
          updatedAt: timestamp,
        }).onConflictDoUpdate({
          target: [generationTodos.sessionId, generationTodos.todoIndex],
          set: {
            content,
            activeForm,
            status,
            updatedAt: timestamp,
          },
        })
      );
    };

    const persistToolCall = async (eventData: { toolCallId?: string; id?: string; toolName?: string; todoIndex?: number; todo_index?: number; input?: unknown; output?: unknown }, state: 'input-available' | 'output-available') => {
      const toolCallId = eventData.toolCallId ?? eventData.id ?? randomUUID();
      const todoIndex = typeof eventData.todoIndex === 'number'
        ? eventData.todoIndex
        : typeof eventData.todo_index === 'number'
          ? eventData.todo_index
          : -1;

      const timestamp = new Date();

      // If toolName is missing and this is an output event, try to find the existing record
      if (!eventData.toolName && state === 'output-available') {
        const existing = await retryOnTimeout(() =>
          db.select()
            .from(generationToolCalls)
            .where(and(
              eq(generationToolCalls.sessionId, sessionId),
              eq(generationToolCalls.toolCallId, toolCallId),
            ))
            .limit(1)
        );

        if (existing && existing.length > 0) {
          // Update existing record
          await retryOnTimeout(() =>
            db.update(generationToolCalls)
              .set({
                output: eventData.output ?? null,
                state,
                endedAt: timestamp,
                updatedAt: timestamp,
              })
              .where(eq(generationToolCalls.id, existing[0].id))
          );
          return;
        }
        // If no existing record and no toolName, we can't insert - skip it
        return;
      }

      // Ensure toolName exists for insert
      if (!eventData.toolName) {
        return;
      }

      const toolName = eventData.toolName; // Extract to narrow type

      await retryOnTimeout(() =>
        db.insert(generationToolCalls).values({
          sessionId,
          todoIndex,
          toolCallId,
          name: toolName,
          input: state === 'input-available' ? eventData.input ?? null : undefined,
          output: state === 'output-available' ? eventData.output ?? null : undefined,
          state,
          startedAt: timestamp,
          endedAt: state === 'output-available' ? timestamp : null,
          createdAt: timestamp,
          updatedAt: timestamp,
        }).onConflictDoUpdate({
          target: [generationToolCalls.sessionId, generationToolCalls.toolCallId],
          set: {
            input: state === 'input-available' ? eventData.input ?? null : generationToolCalls.input,
            output: state === 'output-available' ? eventData.output ?? null : generationToolCalls.output,
            state,
            endedAt: state === 'output-available' ? timestamp : generationToolCalls.endedAt,
            updatedAt: timestamp,
          },
        })
      );
    };

    const appendNote = async (params: { textId?: string; content: string; kind: string; todoIndex: number }) => {
      const { textId, content, kind, todoIndex } = params;
      if (!content) return;
      const timestamp = new Date();

      if (textId) {
        const existing = await retryOnTimeout(() =>
          db
            .select()
            .from(generationNotes)
            .where(and(
              eq(generationNotes.sessionId, sessionId),
              eq(generationNotes.textId, textId),
            ))
            .limit(1)
        );

        if (existing && existing.length > 0) {
          await retryOnTimeout(() =>
            db.update(generationNotes)
              .set({
                content: existing[0].content + content,
              })
              .where(eq(generationNotes.id, existing[0].id))
          );
          return;
        }
      }

      await retryOnTimeout(() =>
        db.insert(generationNotes).values({
          sessionId,
          todoIndex,
          textId: textId ?? null,
          kind,
          content,
          createdAt: timestamp,
        })
      );
    };

    const persistEvent = async (eventData: { type?: string; toolCallId?: string; toolName?: string; todoIndex?: number; input?: { todos?: Array<{ content?: string; activeForm?: string; status?: string }> }; output?: unknown; id?: string; delta?: string; message?: string; data?: { message?: string } }) => {
      if (!eventData || !sessionId) return;
      const timestamp = new Date();

      switch (eventData.type) {
        case 'start':
          await retryOnTimeout(() =>
            db.update(generationSessions)
              .set({
                status: 'active',
                updatedAt: timestamp,
              })
              .where(eq(generationSessions.id, sessionId))
          );
          await refreshRawState();
          break;
        case 'tool-input-available':
          // Store toolName in map for later output events
          if (eventData.toolCallId && eventData.toolName) {
            toolCallNameMap.set(eventData.toolCallId, eventData.toolName);
          }

          if (eventData.toolName === 'TodoWrite') {
            const todos = Array.isArray(eventData.input?.todos) ? eventData.input.todos : [];

            // CRITICAL: Wait for ALL todos to be persisted BEFORE continuing
            await Promise.all(todos.map((todo, index: number) => persistTodo(todo, index)));

            // Update active todo index for subsequent events
            currentActiveTodoIndex = todos.findIndex((t) => t.status === 'in_progress');
            console.log(`[build-route] Updated activeTodoIndex to ${currentActiveTodoIndex}`);

            // Persist TodoWrite as a tool call
            await persistToolCall(eventData, 'input-available');

            // CRITICAL: Refresh state NOW to ensure frontend has todos before tools arrive
            await refreshRawState();
            console.log(`[build-route] ✅ Todos persisted and state refreshed, activeTodoIndex=${currentActiveTodoIndex}`);

            // Give frontend 50ms to process the TodoWrite update before tools arrive
            await new Promise(resolve => setTimeout(resolve, 50));
            console.log(`[build-route] ⏱️  Waited for frontend to process TodoWrite`);

            // Don't call refreshRawState again at the end - we already did it
            return;
          } else if (eventData.toolName) {
            // Inject active todo index into tool event before persisting
            if (!eventData.todoIndex && currentActiveTodoIndex >= 0) {
              eventData.todoIndex = currentActiveTodoIndex;
              console.log(`[build-route] Injected todoIndex ${currentActiveTodoIndex} into ${eventData.toolName} tool`);
            }
            await persistToolCall(eventData, 'input-available');
          }

          // Only refresh if we didn't already refresh for TodoWrite
          if (eventData.toolName !== 'TodoWrite') {
            await refreshRawState();
          }
          break;
        case 'tool-output-available':
          // Try to restore toolName from map if missing
          if (!eventData.toolName && eventData.toolCallId) {
            const storedToolName = toolCallNameMap.get(eventData.toolCallId);
            if (storedToolName) {
              eventData.toolName = storedToolName;
            }
          }
          await persistToolCall(eventData, 'output-available');
          await refreshRawState();
          break;
        case 'text-delta':
          // Inject active todo index if not present
          const textTodoIndex = typeof eventData.todoIndex === 'number'
            ? eventData.todoIndex
            : currentActiveTodoIndex;
          await appendNote({
            textId: eventData.id,
            content: eventData.delta ?? '',
            kind: 'text',
            todoIndex: textTodoIndex,
          });
          await refreshRawState();
          break;
        case 'data-reasoning':
        case 'reasoning':
          if (eventData.message || eventData.data?.message) {
            // Inject active todo index if not present
            const reasoningTodoIndex = typeof eventData.todoIndex === 'number'
              ? eventData.todoIndex
              : currentActiveTodoIndex;
            await appendNote({
              textId: eventData.id ?? undefined,
              content: eventData.message ?? eventData.data?.message ?? '',
              kind: 'reasoning',
              todoIndex: reasoningTodoIndex,
            });
            await refreshRawState();
          }
          break;
        case 'finish':
          await finalizeSession('completed', timestamp);
          break;
        case 'error':
          await finalizeSession('failed', timestamp);
          break;
        default:
          break;
      }
    };

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let unsubscribe: () => void = () => {};

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

          // Finalize the generation session as completed
          try {
            await finalizeSession('completed', new Date());
            console.log('[build-route] ✅ Finalized generation session as completed');
          } catch (error) {
            console.error('[build-route] Failed to finalize session:', error);
          }

          // Update project status to completed
          try {
            await db.update(projects)
              .set({ status: 'completed', updatedAt: new Date() })
              .where(eq(projects.id, id));
            console.log('[build-route] ✅ Updated project status to completed');
          } catch (error) {
            console.error('[build-route] Failed to update project status:', error);
          }

          unsubscribe();

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

          // Parse events to track messages for DB
          try {
            const match = chunk.match(/data:\s*({.*})/);
            if (match) {
              const eventData = JSON.parse(match[1]);
              try {
                await persistEvent(eventData);
              } catch (persistError) {
                console.error('[build-route] Failed to persist event (non-fatal):', persistError);
                // Continue processing - don't let DB errors stop the stream
              }

              // Track message lifecycle for legacy chat transcript
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
        projectName: generatedFriendlyName || generatedSlug || project[0].name, // Friendly name for display
        context: body.context,
        designPreferences: body.designPreferences, // Pass through to runner (deprecated - use tags)
        tags: body.tags, // Tag-based configuration
        agent: agentId,
        claudeModel: agentId === 'claude-code' ? claudeModel : undefined,
        template: templateMetadata, // NEW: Pass analyzed template metadata to runner
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
