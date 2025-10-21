/**
 * Hook to fetch and update project list from database
 * Polls periodically to keep TUI in sync
 */

import { useState, useEffect } from 'react';

export interface Project {
  id: string;
  name: string;
  slug: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  devServerStatus: 'stopped' | 'starting' | 'running' | 'failed' | null;
}

export function useProjects(apiUrl: string, pollInterval: number = 5000) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchProjects = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/projects`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (isMounted && data.projects) {
          setProjects(data.projects);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      }
    };

    // Initial fetch
    fetchProjects();

    // Poll periodically
    const interval = setInterval(fetchProjects, pollInterval);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [apiUrl, pollInterval]);

  return { projects, error };
}
