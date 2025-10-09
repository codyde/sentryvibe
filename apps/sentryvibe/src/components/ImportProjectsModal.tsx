'use client';

import { useState, useEffect } from 'react';
import { X, FolderPlus, CheckCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface UntrackedProject {
  name: string;
  path: string;
}

interface ImportProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export default function ImportProjectsModal({ isOpen, onClose, onImportComplete }: ImportProjectsModalProps) {
  const [untrackedProjects, setUntrackedProjects] = useState<UntrackedProject[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ successful: number; failed: number } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchUntrackedProjects();
    }
  }, [isOpen]);

  const fetchUntrackedProjects = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/reconcile');
      const data = await res.json();
      setUntrackedProjects(data.inFsNotDb || []);
      // Auto-select all
      setSelectedProjects(new Set(data.inFsNotDb?.map((p: UntrackedProject) => p.name) || []));
    } catch (error) {
      console.error('Failed to fetch untracked projects:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleProject = (name: string) => {
    const newSelected = new Set(selectedProjects);
    if (newSelected.has(name)) {
      newSelected.delete(name);
    } else {
      newSelected.add(name);
    }
    setSelectedProjects(newSelected);
  };

  const handleImport = async () => {
    setIsImporting(true);

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directories: Array.from(selectedProjects) }),
      });

      const data = await res.json();
      setImportResult({
        successful: data.summary?.successful || 0,
        failed: data.summary?.failed || 0,
      });

      onImportComplete();

      // Close after showing result
      setTimeout(() => {
        onClose();
        setImportResult(null);
      }, 2000);
    } catch (error) {
      console.error('Failed to import projects:', error);
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-2xl bg-gradient-to-br from-gray-900 to-gray-800 border border-white/10 rounded-xl shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <FolderPlus className="w-6 h-6 text-purple-400" />
                <h2 className="text-xl font-semibold text-white">Import Existing Projects</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {importResult ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-400" />
                  <p className="text-lg text-white mb-2">Import Complete!</p>
                  <p className="text-sm text-gray-400">
                    {importResult.successful} imported, {importResult.failed} failed
                  </p>
                </div>
              ) : isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                </div>
              ) : untrackedProjects.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <FolderPlus className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>All projects are synced!</p>
                  <p className="text-sm mt-2">No untracked projects found in /projects/</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  <p className="text-sm text-gray-400 mb-4">
                    Found {untrackedProjects.length} untracked project(s) in /projects/ directory
                  </p>
                  {untrackedProjects.map((project) => (
                    <label
                      key={project.name}
                      className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedProjects.has(project.name)}
                        onChange={() => toggleProject(project.name)}
                        className="w-4 h-4 rounded border-white/20"
                      />
                      <div className="flex-1">
                        <p className="text-white font-medium">{project.name}</p>
                        <p className="text-xs text-gray-400">{project.path}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {!importResult && !isLoading && untrackedProjects.length > 0 && (
              <div className="flex items-center justify-between gap-3 p-6 border-t border-white/10">
                <p className="text-sm text-gray-400">
                  {selectedProjects.size} of {untrackedProjects.length} selected
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={selectedProjects.size === 0 || isImporting}
                    className="px-4 py-2 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isImporting ? 'Importing...' : `Import ${selectedProjects.size} Project(s)`}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
