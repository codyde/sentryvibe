'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface Project {
  name: string;
  slug: string;
}

interface FileNode {
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
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [projectsRes, filesRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/files'),
      ]);

      const [projectsData, filesData] = await Promise.all([
        projectsRes.json(),
        filesRes.json(),
      ]);

      setProjects(projectsData.projects || []);
      setFiles(filesData.files || []);
    } catch (error) {
      console.error('Failed to fetch project data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh every 5 seconds
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <ProjectContext.Provider value={{ projects, files, isLoading, refetch: fetchData }}>
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
