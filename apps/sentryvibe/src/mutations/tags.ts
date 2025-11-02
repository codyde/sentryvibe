import { useMutation } from '@tanstack/react-query';
import { AppliedTag } from '@sentryvibe/agent-core/types/tags';

interface TagSuggestionRequest {
  prompt: string;
}

interface TagSuggestionResponse {
  tags: Array<{
    key: string;
    value: string;
    expandedValues?: Record<string, string>;
  }>;
}

async function suggestTags(prompt: string): Promise<TagSuggestionResponse> {
  const response = await fetch('/api/tags/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    throw new Error('Failed to get tag suggestions');
  }

  return response.json();
}

export function useTagSuggestions() {
  return useMutation({
    mutationFn: suggestTags,
  });
}
