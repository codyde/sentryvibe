'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  originalPrompt: string | null;
  icon: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  projectType: string | null;
  path: string;
  runCommand: string | null;
  port: number | null;
  devServerPid: number | null;
  devServerPort: number | null;
  devServerStatus: 'stopped' | 'starting' | 'running' | 'failed' | null;
  generationState: string | null; // Serialized JSON of GenerationState
  lastActivityAt: Date | null;
  errorMessage: string | null;
  tunnelUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: FileNode[];
}

interface ProjectContextType {
  projects: Project[];
  files: FileNode[];
  isLoading: boolean;
  refetch: () => void;
  runnerOnline: boolean | null;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [runnerOnline, setRunnerOnline] = useState<boolean | null>(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [projectsRes, filesRes, runnerStatusRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/files'),
        fetch('/api/runner/status'),
      ]);

      const [projectsData, filesData, runnerStatusData] = await Promise.all([
        projectsRes.json(),
        filesRes.json(),
        runnerStatusRes.json().catch(() => ({ connections: [] })),
      ]);

      setProjects(projectsData.projects || []);
      setFiles(filesData.files || []);
      if (runnerStatusData && Array.isArray(runnerStatusData.connections)) {
        setRunnerOnline(runnerStatusData.connections.length > 0);
      } else {
        setRunnerOnline(null);
      }
    } catch (error) {
      console.error('Failed to fetch project data:', error);
      setRunnerOnline(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch on mount
  useEffect(() => {
    fetchData();
  }, []);

  // Refetch when window regains focus (catches external changes like terminal commands)
  useEffect(() => {
    let lastFetchTime = 0;
    const FETCH_COOLDOWN = 10000; // 10 seconds cooldown (increased from 5s)

    const handleFocus = () => {
      const now = Date.now();
      const timeSinceLastFetch = now - lastFetchTime;

      if (timeSinceLastFetch < FETCH_COOLDOWN) {
        console.log(`⏭️  Skipping focus refetch (cooldown: ${Math.round((FETCH_COOLDOWN - timeSinceLastFetch) / 1000)}s remaining)`);
        return;
      }

      console.log('🔄 Window focused, refreshing project data...');
      lastFetchTime = now;
      fetchData();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  return (
    <ProjectContext.Provider value={{ projects, files, isLoading, refetch: fetchData, runnerOnline }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjects() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProjects must be used within a ProjectProvider');
  }
  return context;
}
