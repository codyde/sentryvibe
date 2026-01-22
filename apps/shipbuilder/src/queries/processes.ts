import { useQuery } from '@tanstack/react-query';

export interface RunningProcess {
  projectId: string;
  projectName: string;
  projectSlug: string;
  pid: number | null;
  port: number | null;
  tunnelUrl: string | null;
  status: string;
  inMemory: boolean;
  runnerId: string;
}

interface ProcessesResponse {
  processes: RunningProcess[];
}

async function fetchProcesses(): Promise<ProcessesResponse> {
  const res = await fetch('/api/processes');
  if (!res.ok) {
    throw new Error('Failed to fetch processes');
  }
  return res.json();
}

export function useProcesses(enabled: boolean = true) {
  return useQuery({
    queryKey: ['processes'],
    queryFn: fetchProcesses,
    enabled, // Only fetch when modal is open
    refetchInterval: enabled ? 5000 : false, // Poll every 5 seconds when modal is open
    staleTime: 4000, // Consider data stale after 4 seconds
  });
}
