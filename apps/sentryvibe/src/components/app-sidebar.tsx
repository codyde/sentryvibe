"use client"

import * as React from "react"
import { Activity, Settings, Command, Monitor } from "lucide-react"
import { useProjects } from "@/contexts/ProjectContext"
import { ActivityFeed } from "@/components/sidebar/ActivityFeed"
import { SmartProjectGroups } from "@/components/sidebar/SmartProjectGroups"
import RenameProjectModal from "@/components/RenameProjectModal"
import DeleteProjectModal from "@/components/DeleteProjectModal"
import RunnerSelector from "@/components/RunnerSelector"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarRail,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onOpenProcessModal: () => void;
}

export function AppSidebar({ onOpenProcessModal, ...props }: AppSidebarProps) {
  const { projects, refetch, isLoading } = useProjects();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentProjectSlug = searchParams?.get('project') ?? null;
  const [renamingProject, setRenamingProject] = React.useState<{ id: string; name: string } | null>(null);
  const [deletingProject, setDeletingProject] = React.useState<{ id: string; name: string; slug: string } | null>(null);

  const handleStartServer = async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/start`, { method: 'POST' });
      if (res.ok) {
        refetch();
      }
    } catch (error) {
      console.error('Failed to start server:', error);
    }
  };

  const handleStopServer = async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/stop`, { method: 'POST' });
      if (res.ok) {
        refetch();
      }
    } catch (error) {
      console.error('Failed to stop server:', error);
    }
  };

  return (
    <>
      {renamingProject && (
        <RenameProjectModal
          isOpen={!!renamingProject}
          onClose={() => setRenamingProject(null)}
          projectId={renamingProject.id}
          currentName={renamingProject.name}
          onRenameComplete={() => {
            setRenamingProject(null);
            refetch();
          }}
        />
      )}

      {deletingProject && (
        <DeleteProjectModal
          isOpen={!!deletingProject}
          onClose={() => setDeletingProject(null)}
          projectId={deletingProject.id}
          projectName={deletingProject.name}
          projectSlug={deletingProject.slug}
          onDeleteComplete={() => {
            setDeletingProject(null);
            refetch();

            // If we're currently viewing the project being deleted, do a hard navigation
            if (currentProjectSlug === deletingProject.slug) {
              console.log('Navigating away from deleted project');
              window.location.href = '/';
            } else {
              router.push('/');
            }
          }}
        />
      )}

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
              <h1 className="text-lg font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                SentryVibe
              </h1>
              <p className="text-xs text-gray-500">Mission Control</p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="px-0">
          {isLoading ? (
            // Loading skeleton
            <div className="px-3 py-4 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-white/5 rounded mb-2" style={{ width: `${60 + (i * 8)}%` }} />
                  <div className="h-3 bg-white/5 rounded" style={{ width: `${40 + (i * 5)}%` }} />
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* New Project Button */}
              <div className="px-3 pt-3 pb-2">
                <a
                  href="/"
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium rounded-lg transition-all shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>New Project</span>
                </a>
              </div>

              {/* System Monitor Button */}
              <div className="px-3 pb-2">
                <button
                  onClick={onOpenProcessModal}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 text-white border border-purple-500/30 hover:border-purple-500/40 rounded-lg transition-all shadow-sm"
                >
                  <Monitor className="w-4 h-4 text-purple-400" />
                  <span className="font-medium">System Monitor</span>
                </button>
              </div>

              {/* Runner Selector */}
              <div className="px-3 pb-3">
                <RunnerSelector />
              </div>

              {/* Divider */}
              <div className="border-t border-white/5 my-2"></div>

              {/* Live Activity Feed */}
              <SidebarGroup>
                <SidebarGroupLabel className="px-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                  <Activity className="w-3 h-3 text-green-400" />
                  Live Activity
                </SidebarGroupLabel>
                <ActivityFeed projects={projects} />
              </SidebarGroup>

              {/* Smart Project Groups */}
              <SidebarGroup className="border-t border-white/5 pt-4">
                <SmartProjectGroups
                  projects={projects}
                  onStartServer={handleStartServer}
                  onStopServer={handleStopServer}
                  onRename={setRenamingProject}
                  onDelete={setDeletingProject}
                />
              </SidebarGroup>
            </>
          )}
        </SidebarContent>

        {/* Footer */}
        <SidebarFooter className="border-t border-white/10 p-3">
          {/* Footer intentionally minimal */}
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>
    </>
  )
}
