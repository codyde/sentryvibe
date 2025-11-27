"use client"

import { useState, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Search,
  ChevronDown,
  ChevronRight,
  Zap,
  FolderOpen,
  ArrowUpDown,
  Clock,
  SortAsc
} from "lucide-react"
import { type Project } from "@/contexts/ProjectContext"
import { ProjectCard } from "./ProjectCard"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface ProjectListProps {
  projects: Project[]
  onStartServer: (projectId: string) => void
  onStopServer: (projectId: string) => void
  onRename: (project: { id: string; name: string }) => void
  onDelete: (project: { id: string; name: string; slug: string }) => void
}

type SortOption = 'recent' | 'name' | 'framework'

export function ProjectList({
  projects,
  onStartServer,
  onStopServer,
  onRename,
  onDelete
}: ProjectListProps) {
  const searchParams = useSearchParams()
  const currentProjectSlug = searchParams?.get('project') ?? null

  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('recent')
  const [activeExpanded, setActiveExpanded] = useState(true)
  const [allExpanded, setAllExpanded] = useState(true)
  const [showAllProjects, setShowAllProjects] = useState(false)

  // Filter projects by search
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects
    const query = searchQuery.toLowerCase()
    return projects.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.slug.toLowerCase().includes(query) ||
      p.detectedFramework?.toLowerCase().includes(query)
    )
  }, [projects, searchQuery])

  // Separate active (building/running) from inactive
  const activeProjects = useMemo(() =>
    filteredProjects.filter(p =>
      p.status === 'in_progress' ||
      p.status === 'pending' ||
      p.devServerStatus === 'running' ||
      p.devServerStatus === 'failed'
    ),
    [filteredProjects]
  )

  const inactiveProjects = useMemo(() => {
    const inactive = filteredProjects.filter(p =>
      p.status !== 'in_progress' &&
      p.status !== 'pending' &&
      p.devServerStatus !== 'running' &&
      p.devServerStatus !== 'failed'
    )

    // Sort inactive projects
    return inactive.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'framework':
          const frameworkA = a.detectedFramework || 'zzz'
          const frameworkB = b.detectedFramework || 'zzz'
          return frameworkA.localeCompare(frameworkB)
        case 'recent':
        default:
          const dateA = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0
          const dateB = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0
          return dateB - dateA
      }
    })
  }, [filteredProjects, sortBy])

  // Show first 10 projects by default, all if expanded
  const displayedProjects = showAllProjects
    ? inactiveProjects
    : inactiveProjects.slice(0, 10)

  const hiddenCount = inactiveProjects.length - displayedProjects.length

  const sortLabels: Record<SortOption, string> = {
    recent: 'Recent',
    name: 'Name',
    framework: 'Framework'
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search Input */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-black/20 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Project Sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Active Projects Section */}
        {activeProjects.length > 0 && (
          <div className="border-b border-white/5">
            <button
              onClick={() => setActiveExpanded(!activeExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                {activeExpanded ? (
                  <ChevronDown className="w-3 h-3 text-gray-500" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-gray-500" />
                )}
                <Zap className="w-4 h-4 text-green-400" />
                <span className="text-sm font-medium text-white">Active</span>
              </div>
              <span className="text-xs text-gray-500">{activeProjects.length}</span>
            </button>

            <AnimatePresence>
              {activeExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pb-2 space-y-0.5">
                    {activeProjects.map(project => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        isCurrentProject={project.slug === currentProjectSlug}
                        onStartServer={() => onStartServer(project.id)}
                        onStopServer={() => onStopServer(project.id)}
                        onRename={() => onRename({ id: project.id, name: project.name })}
                        onDelete={() => onDelete({ id: project.id, name: project.name, slug: project.slug })}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* All Projects Section */}
        <div>
          <div className="flex items-center justify-between px-3 py-2">
            <button
              onClick={() => setAllExpanded(!allExpanded)}
              className="flex items-center gap-2 hover:bg-white/5 transition-colors rounded px-1 -ml-1"
            >
              {allExpanded ? (
                <ChevronDown className="w-3 h-3 text-gray-500" />
              ) : (
                <ChevronRight className="w-3 h-3 text-gray-500" />
              )}
              <FolderOpen className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-white">Projects</span>
              <span className="text-xs text-gray-500">({inactiveProjects.length})</span>
            </button>

            {/* Sort Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors">
                  <ArrowUpDown className="w-3 h-3" />
                  {sortLabels[sortBy]}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-32 bg-black border-white/10" align="end">
                <DropdownMenuItem
                  onClick={() => setSortBy('recent')}
                  className={sortBy === 'recent' ? 'bg-white/10' : ''}
                >
                  <Clock className="w-3 h-3 mr-2" />
                  Recent
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy('name')}
                  className={sortBy === 'name' ? 'bg-white/10' : ''}
                >
                  <SortAsc className="w-3 h-3 mr-2" />
                  Name
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy('framework')}
                  className={sortBy === 'framework' ? 'bg-white/10' : ''}
                >
                  <FolderOpen className="w-3 h-3 mr-2" />
                  Framework
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <AnimatePresence>
            {allExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                {displayedProjects.length > 0 ? (
                  <div className="pb-2 space-y-0.5">
                    {displayedProjects.map(project => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        isCurrentProject={project.slug === currentProjectSlug}
                        onStartServer={() => onStartServer(project.id)}
                        onStopServer={() => onStopServer(project.id)}
                        onRename={() => onRename({ id: project.id, name: project.name })}
                        onDelete={() => onDelete({ id: project.id, name: project.name, slug: project.slug })}
                      />
                    ))}

                    {/* Show more button */}
                    {hiddenCount > 0 && (
                      <button
                        onClick={() => setShowAllProjects(true)}
                        className="w-full px-3 py-2 text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-center"
                      >
                        Show {hiddenCount} more projects...
                      </button>
                    )}

                    {showAllProjects && inactiveProjects.length > 10 && (
                      <button
                        onClick={() => setShowAllProjects(false)}
                        className="w-full px-3 py-2 text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-center"
                      >
                        Show less
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="px-3 py-6 text-center">
                    {searchQuery ? (
                      <p className="text-xs text-gray-500">No projects match "{searchQuery}"</p>
                    ) : (
                      <p className="text-xs text-gray-500">No projects yet</p>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
