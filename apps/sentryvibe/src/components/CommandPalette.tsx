'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import * as Dialog from '@radix-ui/react-dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { useProjects } from '@/contexts/ProjectContext';
import { useRunner } from '@/contexts/RunnerContext';
import {
  Search,
  Plus,
  Monitor,
  Play,
  Square,
  Folder,
  ExternalLink,
  Trash2,
  Edit3,
  CheckSquare,
  XSquare,
  Loader2,
  ChevronRight,
  ArrowLeft,
  type LucideIcon,
} from 'lucide-react';
import { getIconComponent } from '@sentryvibe/agent-core/lib/icon-mapper';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenProcessModal?: () => void;
  onRenameProject?: (project: { id: string; name: string }) => void;
  onDeleteProject?: (project: { id: string; name: string; slug: string }) => void;
}

type CommandAction =
  | { type: 'navigate'; path: string }
  | { type: 'action'; fn: () => void | Promise<void> }
  | { type: 'bulk-select'; projectId: string };

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
  action: CommandAction;
  group?: string;
}

export function CommandPalette({ open, onOpenChange, onOpenProcessModal, onRenameProject, onDeleteProject }: CommandPaletteProps) {
  const router = useRouter();
  const { projects, refetch } = useProjects();
  const { selectedRunnerId } = useRunner();
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  // Reset all state when closing
  useEffect(() => {
    if (!open) {
      setBulkMode(false);
      setSelectedItems(new Set());
      setLoadingAction(null);
      setSelectedProject(null);
    }
  }, [open]);

  // Handle escape key for navigation
  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedProject) {
          e.preventDefault();
          setSelectedProject(null);
        }
        // Otherwise let Command.Dialog handle closing
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, selectedProject]);

  // Build command list
  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];

    // If a project is selected, show only that project's actions
    if (selectedProject) {
      const project = projects.find(p => p.id === selectedProject);
      if (!project) return items;

      const isRunning = project.devServerStatus === 'running';
      const isBuilding = project.status === 'in_progress';

      // View/Navigate to project
      items.push({
        id: 'view-project',
        label: 'View Project',
        description: 'Go to project workspace',
        icon: Folder,
        action: {
          type: 'action',
          fn: () => {
            router.push(`/?project=${project.slug}`);
            onOpenChange(false);
          },
        },
        group: 'Navigate',
      });

      // Server actions
      if (isRunning) {
        items.push({
          id: 'stop-server',
          label: 'Stop Server',
          description: loadingAction === 'stop-server' ? 'Stopping...' : 'Stop development server',
          icon: Square,
          action: {
            type: 'action',
            fn: async () => {
              setLoadingAction('stop-server');
              await fetch(`/api/projects/${project.id}/stop`, { method: 'POST' });
              await refetch();
              setLoadingAction(null);
            },
          },
          group: 'Server',
        });

        items.push({
          id: 'open-browser',
          label: 'Open in Browser',
          description: `localhost:${project.devServerPort || project.port}`,
          icon: ExternalLink,
          action: {
            type: 'action',
            fn: () => {
              const port = project.devServerPort || project.port || 3000;
              window.open(`http://localhost:${port}`, '_blank');
            },
          },
          group: 'Server',
        });
      } else if (!isBuilding && project.runCommand) {
        items.push({
          id: 'start-server',
          label: 'Start Server',
          description: loadingAction === 'start-server' ? 'Starting...' : 'Start development server',
          icon: Play,
          action: {
            type: 'action',
            fn: async () => {
              setLoadingAction('start-server');
              await fetch(`/api/projects/${project.id}/start`, { method: 'POST' });
              await refetch();
              setLoadingAction(null);
            },
          },
          group: 'Server',
        });
      }

      // Project management
      if (onRenameProject) {
        items.push({
          id: 'rename-project',
          label: 'Rename Project',
          description: 'Change project name',
          icon: Edit3,
          action: {
            type: 'action',
            fn: () => {
              onRenameProject({ id: project.id, name: project.name || project.slug || 'Unnamed Project' });
              onOpenChange(false);
            },
          },
          group: 'Manage',
        });
      }

      if (onDeleteProject) {
        items.push({
          id: 'delete-project',
          label: 'Delete Project',
          description: 'Permanently delete this project',
          icon: Trash2,
          action: {
            type: 'action',
            fn: () => {
              onDeleteProject({ id: project.id, name: project.name || project.slug || 'Unnamed Project', slug: project.slug });
              onOpenChange(false);
            },
          },
          group: 'Manage',
        });
      }

      return items;
    }

    // Top-level view: Show global actions and project list
    // Global actions
    items.push({
      id: 'new-project',
      label: 'New Project',
      description: 'Create a new AI-powered project',
      icon: Plus,
      action: { type: 'navigate', path: '/' },
      group: 'Actions',
    });

    if (onOpenProcessModal) {
      items.push({
        id: 'system-monitor',
        label: 'System Monitor',
        description: 'View running processes',
        icon: Monitor,
        action: {
          type: 'action',
          fn: () => {
            onOpenProcessModal();
            onOpenChange(false);
          },
        },
        group: 'Actions',
      });
    }

    // Toggle bulk mode
    items.push({
      id: 'toggle-bulk',
      label: bulkMode ? 'Exit Bulk Mode' : 'Enable Bulk Mode',
      description: bulkMode ? 'Switch back to normal mode' : 'Select multiple projects for bulk operations',
      icon: bulkMode ? XSquare : CheckSquare,
      action: {
        type: 'action',
        fn: () => setBulkMode(!bulkMode),
      },
      group: 'Actions',
    });

    // Project list - drill down on selection
    projects.forEach((project) => {
      // In bulk mode, show selection toggle
      if (bulkMode) {
        const isSelected = selectedItems.has(project.id);
        items.push({
          id: `select-${project.id}`,
          label: `${isSelected ? '✓ ' : ''}${project.name || project.slug || 'Unnamed Project'}`,
          description: isSelected ? 'Click to deselect' : 'Click to select',
          icon: getIconComponent(project.icon),
          action: { type: 'bulk-select', projectId: project.id },
          group: 'Projects',
        });
        return;
      }

      // Normal mode: Show project list, drill down to see actions
      const projectIcon = getIconComponent(project.icon);
      const metadata: string[] = [];
      if (project.projectType) metadata.push(project.projectType);
      if (project.port || project.devServerPort) metadata.push(`Port ${project.devServerPort || project.port}`);
      if (project.runnerId) metadata.push(`Runner: ${project.runnerId.substring(0, 8)}`);

      const enhancedDescription = project.description || metadata.join(' • ') || 'View actions';

      items.push({
        id: `project-${project.id}`,
        label: project.name || project.slug || 'Unnamed Project',
        description: enhancedDescription,
        icon: projectIcon,
        action: {
          type: 'action',
          fn: () => setSelectedProject(project.id),
        },
        group: 'Projects',
      });
    });

    return items;
  }, [projects, selectedRunnerId, onOpenProcessModal, onRenameProject, onDeleteProject, onOpenChange, refetch, router, bulkMode, selectedItems, loadingAction, selectedProject]);

  // Group commands
  const groupedCommands = useMemo(() => {
    const groups = new Map<string, CommandItem[]>();
    commands.forEach((cmd) => {
      const group = cmd.group || 'Other';
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)!.push(cmd);
    });
    return Array.from(groups.entries());
  }, [commands]);

  // Bulk action handlers
  const handleBulkStopServers = async () => {
    setLoadingAction('bulk-stop-servers');
    await Promise.all(
      Array.from(selectedItems).map((id) =>
        fetch(`/api/projects/${id}/stop`, { method: 'POST' })
      )
    );
    await refetch();
    setLoadingAction(null);
    setSelectedItems(new Set());
    setBulkMode(false);
    onOpenChange(false);
  };

  const handleBulkDelete = async () => {
    if (confirm(`Are you sure you want to delete ${selectedItems.size} project(s)?`)) {
      setLoadingAction('bulk-delete');
      await Promise.all(
        Array.from(selectedItems).map((id) =>
          fetch(`/api/projects/${id}`, { method: 'DELETE' })
        )
      );
      await refetch();
      setLoadingAction(null);
      setSelectedItems(new Set());
      setBulkMode(false);
      onOpenChange(false);
    }
  };

  const handleClearSelection = () => {
    setSelectedItems(new Set());
  };

  const handleSelect = (command: CommandItem) => {
    const action = command.action;
    switch (action.type) {
      case 'navigate':
        router.push(action.path);
        onOpenChange(false);
        break;
      case 'action':
        action.fn();
        break;
      case 'bulk-select':
        setSelectedItems((prev) => {
          const next = new Set(prev);
          if (next.has(action.projectId)) {
            next.delete(action.projectId);
          } else {
            next.add(action.projectId);
          }
          return next;
        });
        break;
    }
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command Menu"
      className="fixed left-[50%] top-[50%] z-50 w-full max-w-[640px] translate-x-[-50%] translate-y-[-50%]"
    >
      <div className="overflow-hidden rounded-xl border-2 border-purple-500 bg-gray-950 shadow-2xl">
        <VisuallyHidden.Root asChild>
          <Dialog.Title>Command Menu</Dialog.Title>
        </VisuallyHidden.Root>

        {/* Breadcrumb when project selected */}
        {selectedProject && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-purple-500/10">
            <button
              onClick={() => setSelectedProject(null)}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              <span>Back to projects</span>
            </button>
            <ChevronRight className="h-3 w-3 text-gray-600" />
            <span className="text-sm text-white font-medium">
              {projects.find(p => p.id === selectedProject)?.name}
            </span>
          </div>
        )}

        <div className="flex items-center border-b border-white/10 px-4">
          <Search className="mr-2 h-4 w-4 shrink-0 text-gray-500" />
          <Command.Input
            placeholder={
              selectedProject
                ? 'Search actions...'
                : bulkMode
                ? 'Select projects for bulk operations...'
                : 'Search projects and commands...'
            }
            className="flex h-12 w-full bg-transparent py-3 text-sm text-white placeholder:text-gray-500 outline-none"
          />
          {bulkMode && (
            <span className="ml-2 rounded bg-purple-500/20 px-2 py-1 text-xs text-purple-300 border border-purple-500/30 whitespace-nowrap">
              Bulk Mode
            </span>
          )}
          {selectedItems.size > 0 && (
            <span className="ml-2 rounded bg-blue-500/20 px-2 py-1 text-xs text-blue-300 border border-blue-500/30 whitespace-nowrap">
              {selectedItems.size} selected
            </span>
          )}
        </div>

        {/* Bulk Action Buttons */}
        {selectedItems.size > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-purple-500/5">
            <button
              onClick={handleBulkStopServers}
              disabled={loadingAction === 'bulk-stop-servers'}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-red-500/20 border border-red-500/30 rounded-md hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingAction === 'bulk-stop-servers' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Square className="h-3 w-3" />
              )}
              <span>Stop {selectedItems.size} Server{selectedItems.size > 1 ? 's' : ''}</span>
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={loadingAction === 'bulk-delete'}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-red-500/20 border border-red-500/30 rounded-md hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingAction === 'bulk-delete' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              <span>Delete {selectedItems.size} Project{selectedItems.size > 1 ? 's' : ''}</span>
            </button>
            <button
              onClick={handleClearSelection}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-400 bg-gray-800/50 border border-gray-700/50 rounded-md hover:bg-gray-800 hover:text-white transition-colors ml-auto"
            >
              <XSquare className="h-3 w-3" />
              <span>Clear</span>
            </button>
          </div>
        )}

        <Command.List className="max-h-[400px] overflow-y-auto p-2">
          <Command.Empty className="py-6 text-center text-sm text-gray-500">
            No results found.
          </Command.Empty>

          {groupedCommands.map(([group, items]) => (
            <Command.Group
              key={group}
              heading={group}
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-gray-500 [&_[cmdk-group-heading]]:uppercase"
            >
              {items.map((command) => {
                const Icon = command.icon || Folder;
                const isLoading = loadingAction === command.id;
                return (
                  <Command.Item
                    key={command.id}
                    value={command.label}
                    onSelect={() => handleSelect(command)}
                    disabled={isLoading}
                    className="relative flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white outline-none data-[selected=true]:bg-gradient-to-r data-[selected=true]:from-purple-500/20 data-[selected=true]:to-pink-500/20 data-[disabled=true]:opacity-50 data-[disabled=true]:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 shrink-0 text-purple-400 animate-spin" />
                    ) : (
                      <Icon className="h-4 w-4 shrink-0 text-gray-400" />
                    )}
                    <div className="flex-1 overflow-hidden">
                      <div className="font-medium truncate">{command.label}</div>
                      {command.description && (
                        <div className="text-xs text-gray-500 truncate">{command.description}</div>
                      )}
                    </div>
                  </Command.Item>
                );
              })}
            </Command.Group>
          ))}
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
