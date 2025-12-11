export type AgentId = 'claude-code' | 'openai-codex';

export const DEFAULT_AGENT_ID: AgentId = 'claude-code';

export type ClaudeModelId = 'claude-haiku-4-5' | 'claude-sonnet-4-5' | 'claude-opus-4-5';

export const DEFAULT_CLAUDE_MODEL_ID: ClaudeModelId = 'claude-sonnet-4-5';

export const CLAUDE_MODEL_METADATA: Record<ClaudeModelId, { label: string; description: string }> = {
  'claude-haiku-4-5': {
    label: 'Claude Haiku 4.5',
    description: 'Fast and efficient Claude model',
  },
  'claude-sonnet-4-5': {
    label: 'Claude Sonnet 4.5',
    description: 'Balanced performance and quality',
  },
  'claude-opus-4-5': {
    label: 'Claude Opus 4.5',
    description: 'Most capable Claude model for complex tasks',
  },
};

export function getClaudeModelLabel(modelId: ClaudeModelId): string {
  return CLAUDE_MODEL_METADATA[modelId]?.label ?? modelId;
}
