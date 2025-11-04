import { useMutation, useQueryClient } from '@tanstack/react-query';

interface SaveMessageParams {
  id: string;
  projectId: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

async function saveMessage(message: SaveMessageParams): Promise<void> {
  const res = await fetch(`/api/projects/${message.projectId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: message.type,
      content: message.content,
    }),
  });

  if (!res.ok) {
    throw new Error('Failed to save message');
  }
}

/**
 * Mutation hook to save a message to the database
 * Automatically invalidates message cache for the project
 */
export function useSaveMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveMessage,
    onSuccess: (_, variables) => {
      // Invalidate messages query to trigger refetch
      queryClient.invalidateQueries({
        queryKey: ['projects', variables.projectId, 'messages'],
      });
    },
    onError: (error) => {
      console.error('❌ Failed to save message:', error);
    },
  });
}
