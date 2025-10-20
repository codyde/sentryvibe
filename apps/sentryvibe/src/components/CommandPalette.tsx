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
  type LucideIcon,
} from 'lucide-react';
import { getIconComponent } from '@sentryvibe/agent-core/lib/icon-mapper';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenProcessModal?: () => void;
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

export function CommandPalette({ open, onOpenChange, onOpenProcessModal }: CommandPaletteProps) {
  const router = useRouter();
  const { projects, refetch } = useProjects();
  const { selectedRunnerId } = useRunner();
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Reset bulk state when closing
  useEffect(() => {
    if (!open) {
      setBulkMode(false);
      setSelectedItems(new Set());
    }
  }, [open]);

  // Build command list
  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];

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

    // Bulk actions (only show when items are selected)
    if (selectedItems.size > 0) {
      items.push({
        id: 'bulk-stop-servers',
        label: `Stop ${selectedItems.size} Server${selectedItems.size > 1 ? 's' : ''}`,
        description: 'Stop development servers for selected projects',
        icon: Square,
        action: {
          type: 'action',
          fn: async () => {
            await Promise.all(
              Array.from(selectedItems).map((id) =>
                fetch(`/api/projects/${id}/stop`, { method: 'POST' })
              )
            );
            refetch();
            setSelectedItems(new Set());
            setBulkMode(false);
            onOpenChange(false);
          },
        },
        group: 'Bulk Actions',
      });

      items.push({
        id: 'bulk-delete',
        label: `Delete ${selectedItems.size} Project${selectedItems.size > 1 ? 's' : ''}`,
        description: 'Permanently delete selected projects',
        icon: Trash2,
        action: {
          type: 'action',
          fn: async () => {
            if (confirm(`Are you sure you want to delete ${selectedItems.size} project(s)?`)) {
              await Promise.all(
                Array.from(selectedItems).map((id) =>
                  fetch(`/api/projects/${id}`, { method: 'DELETE' })
                )
              );
              refetch();
              setSelectedItems(new Set());
              setBulkMode(false);
              onOpenChange(false);
            }
          },
        },
        group: 'Bulk Actions',
      });

      items.push({
        id: 'clear-selection',
        label: 'Clear Selection',
        description: 'Deselect all projects',
        icon: XSquare,
        action: {
          type: 'action',
          fn: () => setSelectedItems(new Set()),
        },
        group: 'Bulk Actions',
      });
    }

    // Project actions
    projects.forEach((project) => {
      const isRunning = project.devServerStatus === 'running';
      const isBuilding = project.status === 'in_progress';

      // In bulk mode, show selection toggle
      if (bulkMode) {
        const isSelected = selectedItems.has(project.id);
        items.push({
          id: `select-${project.id}`,
          label: `${isSelected ? '✓ ' : ''}${project.name}`,
          description: isSelected ? 'Click to deselect' : 'Click to select',
          icon: getIconComponent(project.icon),
          action: { type: 'bulk-select', projectId: project.id },
          group: 'Projects',
        });
        return; // Skip other actions in bulk mode
      }

      // View project
      items.push({
        id: `view-${project.id}`,
        label: `View ${project.name}`,
        description: project.description || undefined,
        icon: Folder,
        action: { type: 'navigate', path: `/?project=${project.slug}` },
        group: 'Projects',
      });

      if (isRunning) {
        // Stop server
        items.push({
          id: `stop-${project.id}`,
          label: `Stop ${project.name}`,
          description: 'Stop development server',
          icon: Square,
          action: {
            type: 'action',
            fn: async () => {
              await fetch(`/api/projects/${project.id}/stop`, { method: 'POST' });
              refetch();
              onOpenChange(false);
            },
          },
          group: 'Server Actions',
        });

        // Open in browser
        items.push({
          id: `open-${project.id}`,
          label: `Open ${project.name}`,
          description: `Open in browser (localhost:${project.devServerPort || project.port})`,
          icon: ExternalLink,
          action: {
            type: 'action',
            fn: () => {
              const port = project.devServerPort || project.port || 3000;
              window.open(`http://localhost:${port}`, '_blank');
              onOpenChange(false);
            },
          },
          group: 'Server Actions',
        });
      } else if (!isBuilding && project.runCommand) {
        items.push({
          id: `start-${project.id}`,
          label: `Start ${project.name}`,
          description: 'Start development server',
          icon: Play,
          action: {
            type: 'action',
            fn: async () => {
              await fetch(`/api/projects/${project.id}/start`, { method: 'POST' });
              refetch();
              onOpenChange(false);
            },
          },
          group: 'Server Actions',
        });
      }
    });

    return items;
  }, [projects, selectedRunnerId, onOpenProcessModal, onOpenChange, refetch, router, bulkMode, selectedItems]);

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

  const handleSelect = (command: CommandItem) => {
    switch (command.action.type) {
      case 'navigate':
        router.push(command.action.path);
        onOpenChange(false);
        break;
      case 'action':
        command.action.fn();
        break;
      case 'bulk-select':
        setSelectedItems((prev) => {
          const next = new Set(prev);
          if (next.has(command.action.projectId)) {
            next.delete(command.action.projectId);
          } else {
            next.add(command.action.projectId);
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
        <div className="flex items-center border-b border-white/10 px-4">
          <Search className="mr-2 h-4 w-4 shrink-0 text-gray-500" />
          <Command.Input
            placeholder={bulkMode ? 'Select projects for bulk operations...' : 'Search commands...'}
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
                return (
                  <Command.Item
                    key={command.id}
                    value={command.label}
                    onSelect={() => handleSelect(command)}
                    className="relative flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white outline-none data-[selected=true]:bg-gradient-to-r data-[selected=true]:from-purple-500/20 data-[selected=true]:to-pink-500/20"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-gray-400" />
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
