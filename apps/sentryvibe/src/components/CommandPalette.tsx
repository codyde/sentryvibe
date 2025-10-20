'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
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
  | { type: 'action'; fn: () => void | Promise<void> };

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

    // Project actions
    projects.forEach((project) => {
      const isRunning = project.devServerStatus === 'running';
      const isBuilding = project.status === 'in_progress';

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
  }, [projects, selectedRunnerId, onOpenProcessModal, onOpenChange, refetch, router]);

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
        <VisuallyHidden.Root>
          <h2>Command Menu</h2>
        </VisuallyHidden.Root>
        <div className="flex items-center border-b border-white/10 px-4">
          <Search className="mr-2 h-4 w-4 shrink-0 text-gray-500" />
          <Command.Input
            placeholder="Search commands..."
            className="flex h-12 w-full bg-transparent py-3 text-sm text-white placeholder:text-gray-500 outline-none"
          />
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
