import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Project } from '@/queries/projects';

/**
 * Hook to connect to SSE status stream for real-time project updates
 * Automatically invalidates TanStack Query cache when project status changes
 *
 * @param projectId - The project ID to watch for updates
 * @param enabled - Whether to connect to SSE (default: true)
 */
export function useProjectStatusSSE(projectId: string | undefined | null, enabled: boolean = true) {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Don't connect if disabled, no project ID, or not in browser (SSR)
    if (!enabled || !projectId || typeof window === 'undefined') {
      return;
    }

    console.log(`📡 [SSE] Connecting to status stream for project: ${projectId}`);

    // Create EventSource connection (browser only)
    const eventSource = new EventSource(`/api/projects/${projectId}/status-stream`);
    eventSourceRef.current = eventSource;

    // Handle connection open
    eventSource.addEventListener('open', () => {
      console.log(`✅ [SSE] Connected to status stream for ${projectId}`);
    });

    // Handle status updates
    eventSource.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'connected') {
          console.log(`🔗 [SSE] Status stream connected for ${projectId}`);
          return;
        }

        if (data.type === 'status-update' && data.project) {
          console.log(`📥 [SSE] Received status update for ${projectId}:`, {
            devServerStatus: data.project.devServerStatus,
            devServerPort: data.project.devServerPort,
            tunnelUrl: data.project.tunnelUrl,
          });

          // Update cache directly with new data (optimistic real-time update)
          queryClient.setQueryData<Project>(['projects', projectId], (old) => {
            if (!old) return data.project;
            return {
              ...old,
              ...data.project,
              // Ensure dates are preserved as Date objects
              createdAt: old.createdAt,
              updatedAt: new Date(data.project.updatedAt),
              lastActivityAt: data.project.lastActivityAt
                ? new Date(data.project.lastActivityAt)
                : null,
            };
          });

          // Also invalidate projects list to ensure consistency
          queryClient.invalidateQueries({
            queryKey: ['projects'],
            // Don't refetch immediately, just mark as stale
            refetchType: 'none',
          });

          // Invalidate the specific project query (will refetch if being actively watched)
          queryClient.invalidateQueries({
            queryKey: ['projects', projectId],
            refetchType: 'none',
          });
        }
      } catch (error) {
        console.error(`❌ [SSE] Error parsing status update for ${projectId}:`, error);
      }
    });

    // Handle errors
    eventSource.addEventListener('error', (error) => {
      console.error(`❌ [SSE] Connection error for ${projectId}:`, error);

      // EventSource will automatically attempt to reconnect
      // We'll just log the error and let it handle reconnection

      // If the connection fails completely, we can fallback to polling
      // TanStack Query will continue to refetch based on refetchInterval
    });

    // Cleanup on unmount or when projectId changes
    return () => {
      console.log(`🔌 [SSE] Disconnecting from status stream for ${projectId}`);
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [projectId, enabled, queryClient]);

  // Return connection status (SSR-safe)
  return {
    isConnected: typeof window !== 'undefined' && eventSourceRef.current?.readyState === 1, // EventSource.OPEN = 1
  };
}
