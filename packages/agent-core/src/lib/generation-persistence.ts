import type { GenerationState } from '@/types/generation';

/**
 * Serialize GenerationState for database storage
 * Converts Date objects to ISO strings
 */
export function serializeGenerationState(state: GenerationState): string {
  const serializable = {
    ...state,
    startTime: state.startTime.toISOString(),
    endTime: state.endTime?.toISOString(),
    codex: state.codex
      ? {
          ...state.codex,
          lastUpdatedAt: state.codex.lastUpdatedAt?.toISOString(),
          phases: state.codex.phases.map(phase => ({
            ...phase,
            startedAt: phase.startedAt?.toISOString(),
            completedAt: phase.completedAt?.toISOString(),
          })),
          templateDecision: state.codex.templateDecision
            ? {
                ...state.codex.templateDecision,
                decidedAt: state.codex.templateDecision.decidedAt?.toISOString(),
              }
            : undefined,
          workspaceVerification: state.codex.workspaceVerification
            ? {
                ...state.codex.workspaceVerification,
                verifiedAt: state.codex.workspaceVerification.verifiedAt?.toISOString(),
              }
            : undefined,
          taskSummary: state.codex.taskSummary
            ? {
                ...state.codex.taskSummary,
                capturedAt: state.codex.taskSummary.capturedAt.toISOString(),
              }
            : undefined,
          executionInsights: state.codex.executionInsights?.map(insight => ({
            ...insight,
            timestamp: insight.timestamp.toISOString(),
          })),
        }
      : undefined,
    toolsByTodo: Object.entries(state.toolsByTodo).reduce((acc, [key, tools]) => {
      acc[key] = tools.map(tool => ({
        ...tool,
        startTime: tool.startTime.toISOString(),
        endTime: tool.endTime?.toISOString(),
      }));
      return acc;
    }, {} as Record<number, any[]>),
    textByTodo: Object.entries(state.textByTodo).reduce((acc, [key, texts]) => {
      acc[key] = texts.map(text => ({
        ...text,
        timestamp: text.timestamp.toISOString(),
      }));
      return acc;
    }, {} as Record<number, any[]>),
  };

  return JSON.stringify(serializable);
}

/**
 * Deserialize GenerationState from database
 * Converts ISO strings back to Date objects
 */
export function deserializeGenerationState(json: string | null): GenerationState | null {
  if (!json) return null;

  try {
    const parsed = JSON.parse(json);

    return {
      ...parsed,
      startTime: new Date(parsed.startTime),
      endTime: parsed.endTime ? new Date(parsed.endTime) : undefined,
      toolsByTodo: Object.entries(parsed.toolsByTodo || {}).reduce((acc, [key, tools]: [string, any]) => {
        acc[parseInt(key)] = tools.map((tool: any) => ({
          ...tool,
          startTime: new Date(tool.startTime),
          endTime: tool.endTime ? new Date(tool.endTime) : undefined,
        }));
        return acc;
      }, {} as Record<number, any[]>),
      textByTodo: Object.entries(parsed.textByTodo || {}).reduce((acc, [key, texts]: [string, any]) => {
        acc[parseInt(key)] = texts.map((text: any) => ({
          ...text,
          timestamp: new Date(text.timestamp),
        }));
        return acc;
      }, {} as Record<number, any[]>),
      codex: parsed.codex
        ? {
            ...parsed.codex,
            lastUpdatedAt: parsed.codex.lastUpdatedAt ? new Date(parsed.codex.lastUpdatedAt) : undefined,
            phases: (parsed.codex.phases || []).map((phase: any) => ({
              ...phase,
              startedAt: phase.startedAt ? new Date(phase.startedAt) : undefined,
              completedAt: phase.completedAt ? new Date(phase.completedAt) : undefined,
            })),
            templateDecision: parsed.codex.templateDecision
              ? {
                  ...parsed.codex.templateDecision,
                  decidedAt: parsed.codex.templateDecision.decidedAt
                    ? new Date(parsed.codex.templateDecision.decidedAt)
                    : undefined,
                }
              : undefined,
            workspaceVerification: parsed.codex.workspaceVerification
              ? {
                  ...parsed.codex.workspaceVerification,
                  verifiedAt: parsed.codex.workspaceVerification.verifiedAt
                    ? new Date(parsed.codex.workspaceVerification.verifiedAt)
                    : undefined,
                }
              : undefined,
            taskSummary: parsed.codex.taskSummary
              ? {
                  ...parsed.codex.taskSummary,
                  capturedAt: parsed.codex.taskSummary.capturedAt
                    ? new Date(parsed.codex.taskSummary.capturedAt)
                    : new Date(),
                }
              : undefined,
            executionInsights: parsed.codex.executionInsights?.map((insight: any) => ({
              ...insight,
              timestamp: insight.timestamp ? new Date(insight.timestamp) : new Date(),
            })),
          }
        : undefined,
    };
  } catch (error) {
    console.error('Failed to deserialize generationState:', error);
    return null;
  }
}

/**
 * Save generationState to database
 */
export async function saveGenerationState(projectId: string, state: GenerationState): Promise<boolean> {
  try {
    console.log('💾 Saving generationState to DB for project:', projectId);

    const serialized = serializeGenerationState(state);

    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationState: serialized }),
    });

    if (!res.ok) {
      const error = await res.json();
      console.error('❌ Save failed:', error);
      return false;
    }

    console.log('✅ generationState saved successfully!');
    return true;
  } catch (error) {
    console.error('❌ Save error:', error);
    return false;
  }
}
