'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { useProjects } from '@/contexts/ProjectContext';
import { useRunner } from '@/contexts/RunnerContext';
import {
  Search,
  Plus,
  Monitor,
  Play,
  Square,
  Folder,
  Trash2,
  Edit3,
  ExternalLink,
  Zap,
  CheckSquare,
  XSquare,
  type LucideIcon,
} from 'lucide-react';
import { getIconComponent } from '@sentryvibe/agent-core/lib/icon-mapper';
import { motion, AnimatePresence } from 'framer-motion';

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
  keywords?: string[];
  action: CommandAction;
  group?: string;
}

export function CommandPalette({ open, onOpenChange, onOpenProcessModal }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const router = useRouter();
  const { projects, refetch } = useProjects();
  const { selectedRunnerId } = useRunner();

  // Reset state when closing
  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedItems(new Set());
      setBulkMode(false);
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
      keywords: ['create', 'add', 'new'],
      action: { type: 'navigate', path: '/' },
      group: 'Actions',
    });

    if (onOpenProcessModal) {
      items.push({
        id: 'system-monitor',
        label: 'System Monitor',
        description: 'View running processes and system status',
        icon: Monitor,
        keywords: ['processes', 'monitor', 'system'],
        action: { type: 'action', fn: () => {
          onOpenProcessModal();
          onOpenChange(false);
        }},
        group: 'Actions',
      });
    }

    // Bulk actions (only show when items are selected)
    if (selectedItems.size > 0) {
      items.push({
        id: 'bulk-stop-servers',
        label: `Stop ${selectedItems.size} Server${selectedItems.size > 1 ? 's' : ''}`,
        description: 'Stop development servers for selected projects',
        icon: Square,
        action: { type: 'action', fn: async () => {
          const projectsToStop = projects.filter(
            p => selectedItems.has(p.id) && p.devServerStatus === 'running'
          );

          await Promise.all(
            projectsToStop.map(p =>
              fetch(`/api/projects/${p.id}/stop`, { method: 'POST' })
            )
          );

          refetch();
          setSelectedItems(new Set());
          setBulkMode(false);
          onOpenChange(false);
        }},
        group: 'Bulk Actions',
      });

      items.push({
        id: 'bulk-delete',
        label: `Delete ${selectedItems.size} Project${selectedItems.size > 1 ? 's' : ''}`,
        description: 'Permanently delete selected projects',
        icon: Trash2,
        action: { type: 'action', fn: async () => {
          if (!confirm(`Are you sure you want to delete ${selectedItems.size} project(s)? This cannot be undone.`)) {
            return;
          }

          await Promise.all(
            Array.from(selectedItems).map(id =>
              fetch(`/api/projects/${id}`, { method: 'DELETE' })
            )
          );

          refetch();
          setSelectedItems(new Set());
          setBulkMode(false);
          onOpenChange(false);
        }},
        group: 'Bulk Actions',
      });

      items.push({
        id: 'clear-selection',
        label: 'Clear Selection',
        description: 'Deselect all projects',
        icon: XSquare,
        action: { type: 'action', fn: () => {
          setSelectedItems(new Set());
          setBulkMode(false);
        }},
        group: 'Bulk Actions',
      });
    }

    // Add "Enable Bulk Mode" option
    if (!bulkMode && selectedItems.size === 0) {
      items.push({
        id: 'enable-bulk-mode',
        label: 'Enable Bulk Mode',
        description: 'Select multiple projects for batch operations',
        icon: CheckSquare,
        keywords: ['bulk', 'multi', 'select', 'batch'],
        action: { type: 'action', fn: () => setBulkMode(true) },
        group: 'Actions',
      });
    }

    // Project actions
    projects.forEach((project) => {
      const ProjectIcon = getIconComponent(project.icon);
      const isRunning = project.devServerStatus === 'running';
      const isBuilding = project.status === 'in_progress';
      const isSelected = selectedItems.has(project.id);

      // View project
      items.push({
        id: `view-${project.id}`,
        label: isSelected ? `✓ ${project.name}` : project.name,
        description: bulkMode ? 'Click to toggle selection' : `View ${project.name}`,
        icon: ProjectIcon,
        keywords: [project.name, project.projectType || '', 'project', 'view'],
        action: bulkMode
          ? { type: 'bulk-select', projectId: project.id }
          : { type: 'navigate', path: `/?project=${project.slug}` },
        group: 'Projects',
      });

      // Start/Stop server
      if (!bulkMode) {
        if (isRunning) {
          items.push({
            id: `stop-${project.id}`,
            label: `Stop ${project.name}`,
            description: `Stop development server on :${project.devServerPort || project.port}`,
            icon: Square,
            keywords: [project.name, 'stop', 'kill', 'server'],
            action: { type: 'action', fn: async () => {
              await fetch(`/api/projects/${project.id}/stop`, { method: 'POST' });
              refetch();
              onOpenChange(false);
            }},
            group: 'Server Actions',
          });

          // Open in browser
          items.push({
            id: `open-${project.id}`,
            label: `Open ${project.name}`,
            description: `Open in browser (localhost:${project.devServerPort || project.port})`,
            icon: ExternalLink,
            keywords: [project.name, 'open', 'browser', 'preview'],
            action: { type: 'action', fn: () => {
              const port = project.devServerPort || project.port || 3000;
              window.open(`http://localhost:${port}`, '_blank');
              onOpenChange(false);
            }},
            group: 'Server Actions',
          });
        } else if (!isBuilding && project.runCommand) {
          items.push({
            id: `start-${project.id}`,
            label: `Start ${project.name}`,
            description: 'Start development server',
            icon: Play,
            keywords: [project.name, 'start', 'run', 'server'],
            action: { type: 'action', fn: async () => {
              await fetch(`/api/projects/${project.id}/start`, { method: 'POST' });
              refetch();
              onOpenChange(false);
            }},
            group: 'Server Actions',
          });
        }
      }
    });

    return items;
  }, [projects, selectedRunnerId, bulkMode, selectedItems, onOpenProcessModal, onOpenChange, refetch, router]);

  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    if (!search) return commands;

    const query = search.toLowerCase();
    return commands.filter((cmd) => {
      const label = cmd.label.toLowerCase();
      const description = cmd.description?.toLowerCase() || '';
      const keywords = cmd.keywords?.join(' ').toLowerCase() || '';

      return (
        label.includes(query) ||
        description.includes(query) ||
        keywords.includes(query)
      );
    });
  }, [commands, search]);

  // Group commands
  const groupedCommands = useMemo(() => {
    const groups = new Map<string, CommandItem[]>();

    filteredCommands.forEach((cmd) => {
      const group = cmd.group || 'Other';
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)!.push(cmd);
    });

    return Array.from(groups.entries());
  }, [filteredCommands]);

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
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/70"
            onClick={() => onOpenChange(false)}
          />

          {/* Command Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -20 }}
            transition={{ duration: 0.2, type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed left-1/2 top-1/3 z-[51] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2"
            onClick={(e) => e.stopPropagation()}
          >
            <Command shouldFilter={false} loop className="rounded-xl border-2 border-purple-500 bg-gray-950 shadow-2xl shadow-purple-500/30 overflow-hidden backdrop-blur-none">
              <div className="flex items-center border-b border-white/10 px-4">
                <Search className="mr-2 h-4 w-4 shrink-0 text-gray-500" />
                <Command.Input
                  value={search}
                  onValueChange={setSearch}
                  placeholder={bulkMode ? 'Select projects for bulk operations...' : 'Search projects and actions...'}
                  className="flex h-14 w-full bg-transparent py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
                {bulkMode && (
                  <span className="ml-2 rounded bg-purple-500/20 px-2 py-1 text-xs text-purple-300 border border-purple-500/30">
                    Bulk Mode
                  </span>
                )}
                {selectedItems.size > 0 && (
                  <span className="ml-2 rounded bg-blue-500/20 px-2 py-1 text-xs text-blue-300 border border-blue-500/30">
                    {selectedItems.size} selected
                  </span>
                )}
              </div>

              <Command.List className="max-h-[400px] overflow-y-auto overflow-x-hidden p-2 scroll-smooth">
                <Command.Empty className="py-6 text-center text-sm text-gray-500">
                  No results found.
                </Command.Empty>

                {groupedCommands.map(([group, items]) => (
                  <Command.Group
                    key={group}
                    heading={group}
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-gray-500 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                  >
                    {items.map((command) => {
                      const Icon = command.icon || Folder;
                      return (
                        <Command.Item
                          key={command.id}
                          value={`${command.id}-${command.label}`}
                          onSelect={() => handleSelect(command)}
                          className="relative flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white outline-none hover:bg-white/10 aria-selected:bg-gradient-to-r aria-selected:from-purple-500/20 aria-selected:to-pink-500/20 aria-selected:border aria-selected:border-purple-500/30 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 transition-all"
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

              <div className="border-t border-white/10 px-4 py-2 text-xs text-gray-500">
                <div className="flex items-center justify-between">
                  <span>Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded">Esc</kbd> to close</span>
                  <span>Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded">↑↓</kbd> to navigate</span>
                </div>
              </div>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
