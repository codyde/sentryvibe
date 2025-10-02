'use client';

import { useState } from 'react';
import { X, Trash2, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DeleteProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  projectSlug: string;
  onDeleteComplete: () => void;
}

export default function DeleteProjectModal({
  isOpen,
  onClose,
  projectId,
  projectName,
  projectSlug,
  onDeleteComplete,
}: DeleteProjectModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedName, setCopiedName] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState(false);

  const isValid = confirmText === projectName || confirmText === projectSlug;

  const handleCopy = (text: string, type: 'name' | 'slug') => {
    navigator.clipboard.writeText(text);
    if (type === 'name') {
      setCopiedName(true);
      setTimeout(() => setCopiedName(false), 2000);
    } else {
      setCopiedSlug(true);
      setTimeout(() => setCopiedSlug(false), 2000);
    }
  };

  const handleDelete = async () => {
    if (!isValid) return;

    setIsDeleting(true);

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteFiles }),
      });

      if (res.ok) {
        onDeleteComplete();
        onClose();
        setConfirmText('');
        setDeleteFiles(false);
      } else {
        alert('Failed to delete project');
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
      alert('Failed to delete project');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    setConfirmText('');
    setDeleteFiles(false);
    onClose();
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
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-md bg-gradient-to-br from-gray-900 to-gray-800 border border-red-500/30 rounded-xl shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Trash2 className="w-6 h-6 text-red-400" />
                <h2 className="text-xl font-semibold text-white">Delete Project</h2>
              </div>
              <button
                onClick={handleClose}
                className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className="text-gray-300">
                This action cannot be undone. To confirm deletion, type the project name or slug below:
              </p>

              {/* Project Name */}
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Project Name:</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-gray-900 border border-white/10 rounded-md text-white font-mono text-sm">
                    {projectName}
                  </code>
                  <button
                    onClick={() => handleCopy(projectName, 'name')}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors"
                    title="Copy name"
                  >
                    {copiedName ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              {/* Project Slug */}
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Project Slug:</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-gray-900 border border-white/10 rounded-md text-white font-mono text-sm">
                    {projectSlug}
                  </code>
                  <button
                    onClick={() => handleCopy(projectSlug, 'slug')}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors"
                    title="Copy slug"
                  >
                    {copiedSlug ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              {/* Confirmation Input */}
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Type to confirm:</label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-900 border border-white/10 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
                  placeholder="Enter project name or slug"
                  autoFocus
                />
              </div>

              {/* Delete Files Option */}
              <label className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg cursor-pointer hover:bg-red-500/20 transition-colors">
                <input
                  type="checkbox"
                  checked={deleteFiles}
                  onChange={(e) => setDeleteFiles(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20"
                />
                <span className="text-sm text-red-300">Also delete project files from disk</span>
              </label>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-white/10">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!isValid || isDeleting}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? 'Deleting...' : 'Delete Project'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
