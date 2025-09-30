'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Folder, File, Play, Square, ChevronRight, ChevronDown, FolderOpen } from 'lucide-react';

interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: FileNode[];
}

export default function FileExplorer() {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [runningDirectory, setRunningDirectory] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchFiles();
    const interval = setInterval(fetchFiles, 3000); // Refresh every 3 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchFiles = async () => {
    try {
      const response = await fetch('/api/files');
      const data = await response.json();
      const fetchedFiles = data.files || [];
      setFiles(fetchedFiles);

      // On initial load, collapse all folders
      if (collapsedFolders.size === 0 && fetchedFiles.length > 0) {
        const allFolderPaths = new Set<string>();
        const collectFolderPaths = (nodes: FileNode[], parentPath = '') => {
          nodes.forEach((node) => {
            if (node.type === 'directory') {
              allFolderPaths.add(node.path);
              if (node.children) {
                collectFolderPaths(node.children, node.path);
              }
            }
          });
        };
        collectFolderPaths(fetchedFiles);
        setCollapsedFolders(allFolderPaths);
      }
    } catch (error) {
      console.error('Failed to fetch files:', error);
    }
  };

  const handleStartDev = async () => {
    if (!selectedDirectory) return;

    setIsStarting(true);
    try {
      const response = await fetch('/api/start-dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: selectedDirectory }),
      });
      const data = await response.json();
      if (data.success) {
        setRunningDirectory(selectedDirectory);
        // Notify parent about the dev server URL
        window.dispatchEvent(new CustomEvent('devServerStarted', {
          detail: { url: data.url }
        }));
      }
    } catch (error) {
      console.error('Failed to start dev server:', error);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopDev = async () => {
    if (!runningDirectory) return;

    setIsStopping(true);
    try {
      const response = await fetch('/api/start-dev', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: runningDirectory }),
      });
      const data = await response.json();
      if (data.success) {
        setRunningDirectory(null);
        // Notify parent that dev server stopped
        window.dispatchEvent(new CustomEvent('devServerStopped'));
      }
    } catch (error) {
      console.error('Failed to stop dev server:', error);
    } finally {
      setIsStopping(false);
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
                  onClick={() => setSelectedDirectory(node.path)}
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
      className="h-full flex flex-col bg-black border border-white/10 rounded-lg overflow-hidden"
    >
      <div className="border-b border-white/10 p-4 flex items-center justify-between">
        <h2 className="text-lg font-light">File Explorer</h2>
        <div className="flex items-center gap-2">
          {runningDirectory && (
            <button
              onClick={handleStopDev}
              disabled={isStopping}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed transition-all duration-200"
            >
              <Square className="w-4 h-4" />
              {isStopping ? 'Stopping...' : 'Stop'}
            </button>
          )}
          <button
            onClick={handleStartDev}
            disabled={!selectedDirectory || isStarting || !!runningDirectory}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-md hover:bg-gray-200 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed transition-all duration-200"
          >
            <Play className="w-4 h-4" />
            {isStarting ? 'Starting...' : 'Start'}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {files.length > 0 ? (
          renderFileTree(files)
        ) : (
          <div className="text-gray-500 text-sm p-4">No files found in /projects/</div>
        )}
      </div>
    </motion.div>
  );
}