"use client"

import * as React from "react"
import { Folder } from "lucide-react"
import { NavProjects } from "@/components/nav-projects"
import { useProjects } from "@/contexts/ProjectContext"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { projects } = useProjects();

  return (
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
        <NavProjects
          projects={projects.map(p => ({
            name: p.name,
            url: `/?project=${p.slug}`,
            icon: Folder,
          }))}
        />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
