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
      return (a.title ?? '').localeCompare(b.title ?? '');
    }
    return safeA - safeB;
  });
}

function toStringOr(value: unknown, fallback: string): string {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function toOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function toOptionalStringArray(values: unknown): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const mapped = values
    .map(value => toOptionalString(value)?.trim())
    .filter((item): item is string => !!item);
  return mapped.length > 0 ? mapped : undefined;
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
  const timestampValue = (rawEvent as { timestamp?: string | number | Date }).timestamp;
  const timestamp = timestampValue ? new Date(timestampValue) : new Date();

  switch (rawEvent.type) {
    case 'codex-phase-start': {
      const phaseId = rawEvent.phaseId as CodexPhaseId | undefined;
      if (!phaseId) return state;

      let found = false;
      const phases = state.phases.map(phase => {
        if (phase.id === phaseId) {
          found = true;
          return {
            ...phase,
            title: toOptionalString(rawEvent.title) ?? phase.title,
            description: toOptionalString(rawEvent.description) ?? phase.description,
            status: 'active',
            startedAt: phase.startedAt ?? timestamp,
            spotlight: toOptionalString(rawEvent.spotlight) ?? phase.spotlight,
          } as CodexPhase;
        }
        if (phase.status === 'active' && phase.completedAt === undefined) {
          return {
            ...phase,
            status: 'completed',
            completedAt: timestamp,
          } as CodexPhase;
        }
        return phase;
      });

      const next = found
        ? phases
        : [
            ...phases,
            {
              id: phaseId as CodexPhaseId,
              title: toStringOr(rawEvent.title, 'In Progress'),
              description: toStringOr(rawEvent.description, ''),
              status: 'active',
              startedAt: timestamp,
              spotlight: toOptionalString(rawEvent.spotlight),
            } satisfies CodexPhase,
          ];

      return {
        ...state,
        phases: sortPhases(next),
      };
    }
    case 'codex-phase-complete': {
      const phaseId = rawEvent.phaseId as CodexPhaseId | undefined;
      if (!phaseId) return state;

      return {
        ...state,
        phases: sortPhases(
          state.phases.map(phase =>
            phase.id === phaseId
              ? {
                  ...phase,
                  title: toOptionalString(rawEvent.title) ?? phase.title,
                  description: toOptionalString(rawEvent.description) ?? phase.description,
                  status: 'completed',
                  completedAt: timestamp,
                  spotlight: toOptionalString(rawEvent.spotlight) ?? phase.spotlight,
                } satisfies CodexPhase
              : phase
          )
        ),
      };
    }
    case 'codex-phase-blocked': {
      const phaseId = rawEvent.phaseId as CodexPhaseId | undefined;
      if (!phaseId) return state;

      return {
        ...state,
        phases: state.phases.map(phase =>
          phase.id === phaseId
            ? {
                ...phase,
                status: 'blocked',
                spotlight: toOptionalString(rawEvent.reason)
                  ?? toOptionalString(rawEvent.spotlight)
                  ?? phase.spotlight,
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
          phase.id === phaseId
            ? { ...phase, spotlight: toOptionalString(rawEvent.spotlight) ?? phase.spotlight }
            : phase
        ),
      };
    }
    case 'codex-template-decision': {
      return {
        ...state,
        templateDecision: {
          templateId: toStringOr(rawEvent.templateId, 'unknown-template'),
          templateName:
            toOptionalString(rawEvent.templateName)
            ?? toOptionalString(rawEvent.displayName)
            ?? 'Selected Template',
          repository: toOptionalString(rawEvent.repository),
          branch: toOptionalString(rawEvent.branch),
          confidence: typeof rawEvent.confidence === 'number' ? rawEvent.confidence : undefined,
          rationale: toOptionalString(rawEvent.rationale) ?? toOptionalString(rawEvent.reason),
          decidedAt: timestamp,
        },
      };
    }
    case 'codex-workspace-verified': {
      return {
        ...state,
        workspaceVerification: {
          directory: toOptionalString(rawEvent.directory)
            ?? toOptionalString(rawEvent.path)
            ?? '',
          exists: rawEvent.exists !== undefined ? Boolean(rawEvent.exists) : true,
          discoveredEntries: toOptionalStringArray(rawEvent.entries),
          notes: toOptionalString(rawEvent.notes) ?? toOptionalString(rawEvent.summary),
          verifiedAt: timestamp,
        },
      };
    }
    case 'codex-task-summary': {
      const bullets = Array.isArray(rawEvent.bullets)
        ? toOptionalStringArray(rawEvent.bullets) ?? []
        : typeof rawEvent.summary === 'string'
          ? rawEvent.summary.split('\n').map(line => line.trim()).filter(Boolean)
          : [];

      return {
        ...state,
        taskSummary: {
          headline: toOptionalString(rawEvent.headline)
            ?? toOptionalString(rawEvent.title)
            ?? 'Key Tasks Identified',
          bullets,
          capturedAt: timestamp,
        },
      };
    }
    case 'codex-execution-insight': {
      const text = rawEvent.text ?? rawEvent.message ?? '';
      if (!text) return state;

      const tone: CodexExecutionInsight['tone'] = ['success', 'warning', 'error', 'info'].includes(
        toStringOr(rawEvent.tone, '')
      )
        ? (rawEvent.tone as CodexExecutionInsight['tone'])
        : 'info';

      const insight = {
        id: toOptionalString(rawEvent.id) ?? `insight-${Date.now()}`,
        text: toStringOr(text, ''),
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
