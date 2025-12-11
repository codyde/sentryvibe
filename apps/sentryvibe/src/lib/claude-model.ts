export function normalizeClaudeModelId(modelId: string | null | undefined): string | undefined {
  if (!modelId) return undefined;

  const map: Record<string, string> = {
    'claude-haiku-4-5': 'claude-haiku-4-5',
    'claude-sonnet-4-5': 'claude-sonnet-4-5',
    'claude-opus-4-5': 'claude-opus-4-5',
    'claude-opus-4': 'claude-opus-4',
    'claude-opus-4.1': 'claude-opus-4.1',
  };

  return map[modelId] ?? modelId ?? undefined;
}

export function resolveClaudeModelForProvider(modelId: string | null | undefined, fallback = 'claude-haiku-4-5'): string {
  return normalizeClaudeModelId(modelId) ?? fallback;
}
