export function normalizeClaudeModelId(modelId: string | null | undefined): string | undefined {
  if (!modelId) return undefined;

  const map: Record<string, string> = {
    'claude-haiku-4-5': 'haiku',
    'claude-sonnet-4-5': 'sonnet',
    'claude-opus-4': 'opus',
    'claude-opus-4.1': 'opus',
  };

  return map[modelId] ?? modelId ?? undefined;
}

export function resolveClaudeModelForProvider(modelId: string | null | undefined, fallback = 'haiku'): string {
  return normalizeClaudeModelId(modelId) ?? fallback;
}
