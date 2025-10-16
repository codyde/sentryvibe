import type {
  CodexPhaseId,
  CodexSessionState,
  CodexExecutionInsight,
  CodexPhase,
} from '@/types/generation';

const CODEX_PHASE_ORDER: CodexPhaseId[] = [
  'prompt-analysis',
  'template-selection',
  'template-clone',
  'workspace-verification',
  'task-synthesis',
  'execution',
];

function sortPhases(phases: CodexPhase[]): CodexPhase[] {
  return [...phases].sort((a, b) => {
    const idxA = CODEX_PHASE_ORDER.indexOf(a.id as CodexPhaseId);
    const idxB = CODEX_PHASE_ORDER.indexOf(b.id as CodexPhaseId);
    const safeA = idxA === -1 ? CODEX_PHASE_ORDER.length + 1 : idxA;
    const safeB = idxB === -1 ? CODEX_PHASE_ORDER.length + 1 : idxB;
    if (safeA === safeB) {
      return a.title.localeCompare(b.title);
    }
    return safeA - safeB;
  });
}

export type CodexEvent =
  | { type: 'codex-phase-start'; phaseId?: CodexPhaseId; title?: string; description?: string; spotlight?: string; timestamp?: string | number | Date }
  | { type: 'codex-phase-complete'; phaseId?: CodexPhaseId; title?: string; description?: string; spotlight?: string; timestamp?: string | number | Date }
  | { type: 'codex-phase-blocked'; phaseId?: CodexPhaseId; reason?: string; spotlight?: string }
  | { type: 'codex-phase-spotlight'; phaseId?: CodexPhaseId; spotlight?: string }
  | { type: 'codex-template-decision'; templateId?: string; templateName?: string; displayName?: string; repository?: string; branch?: string; confidence?: number; rationale?: string; reason?: string; timestamp?: string | number | Date }
  | { type: 'codex-workspace-verified'; directory?: string; path?: string; exists?: boolean; entries?: string[]; notes?: string; summary?: string; timestamp?: string | number | Date }
  | { type: 'codex-task-summary'; headline?: string; title?: string; bullets?: string[]; summary?: string; timestamp?: string | number | Date }
  | { type: 'codex-execution-insight'; id?: string; text?: string; message?: string; tone?: CodexExecutionInsight['tone']; timestamp?: string | number | Date }
  | { type: string; [key: string]: unknown };

export function processCodexEvent(state: CodexSessionState, rawEvent: CodexEvent): CodexSessionState {
  const timestamp = rawEvent.timestamp ? new Date(rawEvent.timestamp) : new Date();

  switch (rawEvent.type) {
    case 'codex-phase-start': {
      const phaseId = rawEvent.phaseId;
      if (!phaseId) return state;

      let found = false;
      const phases = state.phases.map(phase => {
        if (phase.id === phaseId) {
          found = true;
          return {
            ...phase,
            title: rawEvent.title ?? phase.title,
            description: rawEvent.description ?? phase.description,
            status: 'active',
            startedAt: phase.startedAt ?? timestamp,
            spotlight: rawEvent.spotlight ?? phase.spotlight,
          };
        }
        if (phase.status === 'active' && phase.completedAt === undefined) {
          return { ...phase, status: 'completed', completedAt: timestamp };
        }
        return phase;
      });

      const next = found
        ? phases
        : [
            ...phases,
            {
              id: phaseId,
              title: rawEvent.title ?? 'In Progress',
              description: rawEvent.description ?? '',
              status: 'active',
              startedAt: timestamp,
              spotlight: rawEvent.spotlight,
            },
          ];

      return {
        ...state,
        phases: sortPhases(next),
      };
    }
    case 'codex-phase-complete': {
      const phaseId = rawEvent.phaseId;
      if (!phaseId) return state;

      return {
        ...state,
        phases: sortPhases(
          state.phases.map(phase =>
            phase.id === phaseId
              ? {
                  ...phase,
                  title: rawEvent.title ?? phase.title,
                  description: rawEvent.description ?? phase.description,
                  status: 'completed',
                  completedAt: timestamp,
                  spotlight: rawEvent.spotlight ?? phase.spotlight,
                }
              : phase
          )
        ),
      };
    }
    case 'codex-phase-blocked': {
      const phaseId = rawEvent.phaseId;
      if (!phaseId) return state;

      return {
        ...state,
        phases: state.phases.map(phase =>
          phase.id === phaseId
            ? {
                ...phase,
                status: 'blocked',
                spotlight: rawEvent.reason ?? rawEvent.spotlight ?? phase.spotlight,
              }
            : phase
        ),
      };
    }
    case 'codex-phase-spotlight': {
      const phaseId = rawEvent.phaseId;
      if (!phaseId || !rawEvent.spotlight) return state;

      return {
        ...state,
        phases: state.phases.map(phase =>
          phase.id === phaseId ? { ...phase, spotlight: rawEvent.spotlight } : phase
        ),
      };
    }
    case 'codex-template-decision': {
      return {
        ...state,
        templateDecision: {
          templateId: rawEvent.templateId ?? 'unknown-template',
          templateName: rawEvent.templateName ?? rawEvent.displayName ?? 'Selected Template',
          repository: rawEvent.repository,
          branch: rawEvent.branch,
          confidence: typeof rawEvent.confidence === 'number' ? rawEvent.confidence : undefined,
          rationale: rawEvent.rationale ?? rawEvent.reason,
          decidedAt: timestamp,
        },
      };
    }
    case 'codex-workspace-verified': {
      return {
        ...state,
        workspaceVerification: {
          directory: rawEvent.directory ?? rawEvent.path ?? '',
          exists: rawEvent.exists !== undefined ? Boolean(rawEvent.exists) : true,
          discoveredEntries: Array.isArray(rawEvent.entries) ? rawEvent.entries : undefined,
          notes: rawEvent.notes ?? rawEvent.summary,
          verifiedAt: timestamp,
        },
      };
    }
    case 'codex-task-summary': {
      const bullets = Array.isArray(rawEvent.bullets)
        ? rawEvent.bullets
        : typeof rawEvent.summary === 'string'
          ? rawEvent.summary.split('\n').map(line => line.trim()).filter(Boolean)
          : [];

      return {
        ...state,
        taskSummary: {
          headline: rawEvent.headline ?? rawEvent.title ?? 'Key Tasks Identified',
          bullets,
          capturedAt: timestamp,
        },
      };
    }
    case 'codex-execution-insight': {
      const text = rawEvent.text ?? rawEvent.message ?? '';
      if (!text) return state;

      const tone: CodexExecutionInsight['tone'] = ['success', 'warning', 'error', 'info'].includes(
        rawEvent.tone as string
      )
        ? (rawEvent.tone as CodexExecutionInsight['tone'])
        : 'info';

      const insight = {
        id: rawEvent.id ?? `insight-${Date.now()}`,
        text,
        tone,
        timestamp,
      };

      const existing = state.executionInsights ?? [];
      const existingIndex = existing.findIndex(item => item.id === insight.id);
      const nextInsights =
        existingIndex >= 0
          ? existing.map(item => (item.id === insight.id ? insight : item))
          : [...existing.slice(-19), insight];

      return {
        ...state,
        executionInsights: nextInsights,
      };
    }
    default:
      return state;
  }
}
