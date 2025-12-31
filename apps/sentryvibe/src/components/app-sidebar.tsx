"use client"

import * as React from "react"
import { Plus, Server, ChevronDown, CheckCircle2, Circle, Activity, Lock } from "lucide-react"
import { useProjects } from "@/contexts/ProjectContext"
import { useRunner } from "@/contexts/RunnerContext"
import { useAuth } from "@/contexts/AuthContext"
import { ProjectList } from "@/components/sidebar/ProjectList"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useQueryClient } from "@tanstack/react-query"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onOpenProcessModal: () => void;
  onRenameProject: (project: { id: string; name: string }) => void;
  onDeleteProject: (project: { id: string; name: string; slug: string }) => void;
}

export function AppSidebar({ onOpenProcessModal, onRenameProject, onDeleteProject, ...props }: AppSidebarProps) {
  const { projects, isLoading } = useProjects();
  const { selectedRunnerId, setSelectedRunnerId, availableRunners, isLoading: runnersLoading } = useRunner();
  const { isAuthenticated, isLocalMode } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentProjectSlug = searchParams?.get('project') ?? null;
  const queryClient = useQueryClient();
  
  // Show projects only when authenticated or in local mode
  const canViewProjects = isAuthenticated || isLocalMode;

  // Count running services for the footer badge
  const runningCount = projects.filter(p =>
    p.devServerStatus === 'running' ||
    p.status === 'in_progress' ||
    p.status === 'pending'
  ).length;

  const handleStartServer = async (projectId: string) => {
    try {
      // Optimistically update the project status to 'starting'
      queryClient.setQueryData(['projects'], (old: { projects: typeof projects } | undefined) => {
        if (!old?.projects) return old;
        return {
          ...old,
          projects: old.projects.map((p) =>
            p.id === projectId ? { ...p, devServerStatus: 'starting' as const } : p
          ),
        };
      });

      const res = await fetch(`/api/projects/${projectId}/start`, { method: 'POST' });

      if (res.ok) {
        // Poll for status updates since the server starts asynchronously
        const pollForRunning = async (attempts = 0) => {
          if (attempts > 20) return; // Stop after ~10 seconds

          await queryClient.invalidateQueries({ queryKey: ['projects'] });

          // Check if it's running now
          const data = queryClient.getQueryData(['projects']) as { projects: typeof projects } | undefined;
          const project = data?.projects?.find((p) => p.id === projectId);

          if (project?.devServerStatus === 'running' || project?.devServerStatus === 'failed') {
            return; // Done polling
          }

          // Keep polling
          setTimeout(() => pollForRunning(attempts + 1), 500);
        };

        pollForRunning();
      } else {
        // Revert optimistic update on error
        queryClient.invalidateQueries({ queryKey: ['projects'] });
      }
    } catch (error) {
      console.error('Failed to start server:', error);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    }
  };

  const handleStopServer = async (projectId: string) => {
    try {
      // Optimistically update the project status to 'stopping'
      queryClient.setQueryData(['projects'], (old: { projects: typeof projects } | undefined) => {
        if (!old?.projects) return old;
        return {
          ...old,
          projects: old.projects.map((p) =>
            p.id === projectId ? { ...p, devServerStatus: 'stopping' as const } : p
          ),
        };
      });

      const res = await fetch(`/api/projects/${projectId}/stop`, { method: 'POST' });

      if (res.ok) {
        // Invalidate to get final state
        queryClient.invalidateQueries({ queryKey: ['projects'] });
      } else {
        // Revert optimistic update on error
        queryClient.invalidateQueries({ queryKey: ['projects'] });
      }
    } catch (error) {
      console.error('Failed to stop server:', error);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    }
  };

  // Get selected runner info
  const selectedRunner = availableRunners.find(r => r.runnerId === selectedRunnerId);
  const selectedRunnerHealthy = selectedRunner
    ? (Date.now() - selectedRunner.lastHeartbeat) < 30000
    : false;

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      {/* Header */}
      <SidebarHeader className="p-4 border-b border-white/10 bg-gradient-to-r from-purple-900/20 to-pink-900/20">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 p-2">
            <img
              src="/sentryglyph.png"
              alt="SentryVibe"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white">
              SentryVibe
            </h1>
            <p className="text-xs text-gray-500">AI App Builder</p>
          </div>
        </div>

        {/* New Project Button */}
        <a
          href="/"
          className="flex items-center justify-center gap-2 w-full mt-4 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-sm font-medium rounded-lg transition-all shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40"
        >
          <Plus className="w-4 h-4" />
          <span>New Project</span>
        </a>
      </SidebarHeader>

      {/* Content - Project List */}
      <SidebarContent className="px-0">
        {!canViewProjects ? (
          // Not authenticated - show sign in prompt
          <div className="px-4 py-8 text-center">
            <Lock className="w-10 h-10 mx-auto mb-3 text-zinc-700" />
            <p className="text-sm text-zinc-400 font-medium">Sign in to view projects</p>
            <p className="text-xs text-zinc-600 mt-1">
              Your projects will appear here after signing in
            </p>
          </div>
        ) : isLoading ? (
          <div className="px-3 py-4 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-white/5 rounded mb-2" style={{ width: `${60 + (i * 8)}%` }} />
                <div className="h-3 bg-white/5 rounded" style={{ width: `${40 + (i * 5)}%` }} />
              </div>
            ))}
          </div>
        ) : (
          <ProjectList
            projects={projects}
            onStartServer={handleStartServer}
            onStopServer={handleStopServer}
            onRename={onRenameProject}
            onDelete={onDeleteProject}
          />
        )}
      </SidebarContent>

      {/* Footer - Runner Selector & Running Services */}
      <SidebarFooter className="border-t border-white/10 p-3 space-y-2">
        {/* Runner Dropdown - only show when authenticated and NOT in local mode */}
        {canViewProjects && !isLocalMode && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center justify-between px-3 py-2 bg-black/20 hover:bg-black/30 border border-white/10 rounded-lg transition-colors">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-gray-400" />
                  {runnersLoading ? (
                    <span className="text-xs text-gray-500">Loading...</span>
                  ) : availableRunners.length === 0 ? (
                    <span className="text-xs text-orange-400">No runners</span>
                  ) : (
                    <>
                      <div className={`w-2 h-2 rounded-full ${
                        selectedRunnerHealthy ? 'bg-green-400' : 'bg-red-400'
                      }`} />
                      <span className="text-xs text-white truncate max-w-[120px]">
                        {selectedRunnerId || 'Select runner'}
                      </span>
                    </>
                  )}
                </div>
                <ChevronDown className="w-3 h-3 text-gray-500" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-black border-white/10" align="start" side="top">
              {availableRunners.length === 0 ? (
                <div className="px-3 py-4 text-center">
                  <Circle className="w-6 h-6 mx-auto mb-2 text-orange-400" />
                  <p className="text-xs text-orange-300 font-medium">No Runners Connected</p>
                  <p className="text-[10px] text-gray-500 mt-1">Start a runner to begin building</p>
                </div>
              ) : (
                availableRunners.map((runner) => {
                  const isSelected = runner.runnerId === selectedRunnerId;
                  const isHealthy = (Date.now() - runner.lastHeartbeat) < 30000;

                  return (
                    <DropdownMenuItem
                      key={runner.runnerId}
                      onClick={() => setSelectedRunnerId(runner.runnerId)}
                      className={`flex items-center gap-2 cursor-pointer ${
                        isSelected ? 'bg-purple-500/20' : ''
                      }`}
                    >
                      {isSelected ? (
                        <CheckCircle2 className="w-4 h-4 text-purple-400" />
                      ) : (
                        <Circle className="w-4 h-4 text-gray-600" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate text-white">{runner.runnerId}</p>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${
                        isHealthy ? 'bg-green-400' : 'bg-red-400'
                      }`} />
                    </DropdownMenuItem>
                  );
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Running Services Button - only show when authenticated */}
        {canViewProjects && (
          <button
            onClick={onOpenProcessModal}
            className="w-full flex items-center justify-between px-3 py-2 bg-black/20 hover:bg-black/30 border border-white/10 rounded-lg transition-colors"
          >
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-300">Running Services</span>
            </div>
            {runningCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-500/20 text-green-400 rounded">
                {runningCount}
              </span>
            )}
          </button>
        )}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
