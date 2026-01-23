import { useMutation, useQueryClient } from '@tanstack/react-query';

interface StopProcessRequest {
  projectId: string;
  runnerId: string | null;
}

async function stopProcess({ projectId, runnerId }: StopProcessRequest): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runnerId }),
  });

  if (!res.ok) {
    throw new Error('Failed to stop process');
  }
}

async function stopTunnel({ projectId, runnerId }: StopProcessRequest): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/stop-tunnel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runnerId }),
  });

  if (!res.ok) {
    throw new Error('Failed to stop tunnel');
  }
}

export function useStopProcess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: stopProcess,
    onSuccess: () => {
      // Invalidate processes query to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['processes'] });
    },
  });
}

export function useStopTunnel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: stopTunnel,
    onSuccess: () => {
      // Invalidate processes query to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['processes'] });
    },
  });
}
