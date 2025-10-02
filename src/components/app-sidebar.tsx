"use client"

import * as React from "react"
import { Plus, Terminal, FolderPlus } from "lucide-react"
import { NavProjects } from "@/components/nav-projects"
import { useProjects } from "@/contexts/ProjectContext"
import { getIconComponent } from "@/lib/icon-mapper"
import ImportProjectsModal from "@/components/ImportProjectsModal"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
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
  const { projects, refetch } = useProjects();
  const [showImportModal, setShowImportModal] = React.useState(false);

  return (
    <>
      <ImportProjectsModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={() => {
          refetch();
          setShowImportModal(false);
        }}
      />

      <Sidebar collapsible="icon" {...props}>
        <SidebarHeader className="p-4 border-b border-white/10">
          <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center">
              <img
                src="/sentryglyph.png"
                alt="SentryVibe"
                className="h-8 w-8 object-contain"
              />
            </div>
            <span className="text-lg font-semibold group-data-[collapsible=icon]:hidden">
              SentryVibe
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          {/* New Project Section */}
          <SidebarGroup>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
              Actions
            </SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a href="/" className="font-medium">
                    <Plus />
                    <span>New Project</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => setShowImportModal(true)}>
                  <FolderPlus />
                  <span>Import Projects</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {/* Utilities Section */}
          <SidebarGroup>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
              Utilities
            </SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={onOpenProcessModal}>
                  <Terminal />
                  <span>Dev Servers</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {/* Projects Section */}
          <NavProjects
            projects={projects.map(p => ({
              id: p.id,
              name: p.name,
              slug: p.slug,
              url: `/?project=${p.slug}`,
              icon: getIconComponent(p.icon),
            }))}
          />
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
    </>
  )
}
