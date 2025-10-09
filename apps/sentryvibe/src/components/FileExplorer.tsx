'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Folder, File, ChevronRight, ChevronDown, FolderOpen } from 'lucide-react';
import { useProjects } from '@/contexts/ProjectContext';

interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: FileNode[];
}

interface FileExplorerProps {
  projectFilter?: string | null;
  onDirectorySelect?: (directory: string | null) => void;
}

export default function FileExplorer({ projectFilter, onDirectorySelect }: FileExplorerProps) {
  const { files: allFiles } = useProjects();
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  const files = useMemo(() => {
    let filteredFiles = allFiles;

    // Filter by project if specified
    if (projectFilter) {
      filteredFiles = allFiles.filter((file: FileNode) => file.name === projectFilter);
      // If we're filtering to a single project, expand its contents
      if (filteredFiles.length === 1 && filteredFiles[0].children) {
        filteredFiles = filteredFiles[0].children;
      }
    }

    return filteredFiles;
  }, [allFiles, projectFilter]);

  useEffect(() => {
    // On initial load or when files change, collapse all folders
    if (files.length > 0) {
      const allFolderPaths = new Set<string>();
      const collectFolderPaths = (nodes: FileNode[]) => {
        nodes.forEach((node) => {
          if (node.type === 'directory') {
            allFolderPaths.add(node.path);
            if (node.children) {
              collectFolderPaths(node.children);
            }
          }
        });
      };
      collectFolderPaths(files);
      setCollapsedFolders(allFolderPaths);
    }
  }, [files]);

  const handleDirectorySelect = (path: string) => {
    setSelectedDirectory(path);
    if (onDirectorySelect) {
      onDirectorySelect(path);
    }
  };

  const toggleFolder = (path: string) => {
    const newCollapsed = new Set(collapsedFolders);
    if (newCollapsed.has(path)) {
      newCollapsed.delete(path);
    } else {
      newCollapsed.add(path);
    }
    setCollapsedFolders(newCollapsed);
  };

  const renderFileTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map((node) => {
      const isCollapsed = collapsedFolders.has(node.path);
      const isOpen = !isCollapsed;

      return (
        <div key={node.path}>
          {node.type === 'directory' ? (
            <>
              <div
                style={{ paddingLeft: `${depth * 12}px` }}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-white/5 transition-colors cursor-pointer ${
                  selectedDirectory === node.path ? 'bg-white/10' : ''
                }`}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFolder(node.path);
                  }}
                  className="p-0 hover:opacity-70"
                >
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => handleDirectorySelect(node.path)}
                  className="flex items-center gap-2 flex-1"
                >
                  {isOpen ? (
                    <FolderOpen className="w-4 h-4" />
                  ) : (
                    <Folder className="w-4 h-4" />
                  )}
                  <span>{node.name}</span>
                </button>
              </div>
              {isOpen && node.children && renderFileTree(node.children, depth + 1)}
            </>
          ) : (
            <div
              style={{ paddingLeft: `${depth * 12 + 20}px` }}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400"
            >
              <File className="w-4 h-4" />
              <span>{node.name}</span>
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="h-full flex flex-col bg-black/20 backdrop-blur-md border border-white/10 rounded-xl shadow-xl overflow-hidden"
    >
      <div className="border-b border-white/10 p-4">
        <h2 className="text-lg font-light">File Explorer</h2>
        {projectFilter && (
          <p className="text-xs text-gray-500 mt-1">Showing: {projectFilter}</p>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {files.length > 0 ? (
          renderFileTree(files)
        ) : (
          <div className="text-gray-500 text-sm p-4">
            {projectFilter ? `No files found in ${projectFilter}` : 'No files found in /projects/'}
          </div>
        )}
      </div>
    </motion.div>
  );
}