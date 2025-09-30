"use client"

import {
  Folder,
  Forward,
  MoreHorizontal,
  Trash2,
  Plus,
  type LucideIcon,
} from "lucide-react"

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
    name: string
    url: string
    icon: LucideIcon
  }[]
}) {
  const { isMobile, state } = useSidebar()
  const isCollapsed = state === "collapsed"

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
        Projects
      </SidebarGroupLabel>
      <SidebarMenu>
        {/* New Project Button */}
        <SidebarMenuItem>
          {isCollapsed ? (
            <HoverCard openDelay={0} closeDelay={0}>
              <HoverCardTrigger asChild>
                <SidebarMenuButton asChild tooltip="New Project">
                  <a href="/" className="font-medium">
                    <Plus />
                    <span>New Project</span>
                  </a>
                </SidebarMenuButton>
              </HoverCardTrigger>
              <HoverCardContent side="right" className="w-auto p-2 bg-black border-white/10">
                <div className="text-sm text-white">New Project</div>
              </HoverCardContent>
            </HoverCard>
          ) : (
            <SidebarMenuButton asChild>
              <a href="/" className="font-medium">
                <Plus />
                <span>New Project</span>
              </a>
            </SidebarMenuButton>
          )}
        </SidebarMenuItem>

        {/* Project List */}
        {projects.map((item) => (
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
                <DropdownMenuItem className="text-white hover:bg-white/5">
                  <Folder className="text-gray-400" />
                  <span>View Project</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-white hover:bg-white/5">
                  <Forward className="text-gray-400" />
                  <span>Share Project</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem className="text-white hover:bg-white/5">
                  <Trash2 className="text-gray-400" />
                  <span>Delete Project</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
