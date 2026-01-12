"use client"

import {
  Folder,
  Forward,
  MoreHorizontal,
  Trash2,
  Plus,
  Edit3,
  type LucideIcon,
} from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useProjects } from "@/contexts/ProjectContext"
import RenameProjectModal from "@/components/RenameProjectModal"
import DeleteProjectModal from "@/components/DeleteProjectModal"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

export function NavProjects({
  projects,
}: {
  projects: {
    id: string
    name: string
    slug: string
    url: string
    icon: LucideIcon
  }[]
}) {
  const { isMobile, state } = useSidebar()
  const isCollapsed = state === "collapsed"
  const router = useRouter()
  const { refetch } = useProjects()
  const [renamingProject, setRenamingProject] = useState<{ id: string; name: string } | null>(null)
  const [deletingProject, setDeletingProject] = useState<{ id: string; name: string; slug: string } | null>(null)

  const [searchQuery, setSearchQuery] = useState("")

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.url.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <>
      {renamingProject && (
        <RenameProjectModal
          isOpen={!!renamingProject}
          onClose={() => setRenamingProject(null)}
          projectId={renamingProject.id}
          currentName={renamingProject.name}
          onRenameComplete={() => {
            setRenamingProject(null)
            refetch()
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
            setDeletingProject(null)
            router.push('/') // Redirect to home
            refetch() // Refresh project list
          }}
        />
      )}

      <SidebarGroup>
        <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
          Projects
        </SidebarGroupLabel>

        {/* Search Input */}
        {projects.length > 5 && (
          <div className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 text-sm bg-white/5 border border-white/10 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-theme-primary transition-colors"
            />
          </div>
        )}

        <SidebarMenu>
          {filteredProjects.map((item) => (
            <SidebarMenuItem key={item.name}>
            {isCollapsed ? (
              <HoverCard openDelay={0} closeDelay={0}>
                <HoverCardTrigger asChild>
                  <SidebarMenuButton asChild tooltip={item.name}>
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.name}</span>
                    </a>
                  </SidebarMenuButton>
                </HoverCardTrigger>
                <HoverCardContent side="right" className="w-auto p-2 bg-black border-white/10">
                  <div className="text-sm text-white">{item.name}</div>
                </HoverCardContent>
              </HoverCard>
            ) : (
              <SidebarMenuButton asChild>
                <a href={item.url}>
                  <item.icon />
                  <span>{item.name}</span>
                </a>
              </SidebarMenuButton>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction showOnHover className="group-data-[collapsible=icon]:hidden">
                  <MoreHorizontal />
                  <span className="sr-only">More</span>
                </SidebarMenuAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-48 rounded-lg bg-black border-white/10"
                side={isMobile ? "bottom" : "right"}
                align={isMobile ? "end" : "start"}
              >
                <DropdownMenuItem className="text-white hover:bg-white/5" asChild>
                  <a href={item.url}>
                    <Folder className="text-gray-400" />
                    <span>View Project</span>
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-white hover:bg-white/5 cursor-pointer"
                  onClick={() => setRenamingProject({ id: item.id, name: item.name })}
                >
                  <Edit3 className="text-gray-400" />
                  <span>Rename</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem
                  className="text-red-400 hover:bg-red-500/10 cursor-pointer"
                  onClick={() => setDeletingProject({
                    id: item.id,
                    name: item.name,
                    slug: item.slug
                  })}
                >
                  <Trash2 className="text-red-400" />
                  <span>Delete Project</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    </>
  )
}
