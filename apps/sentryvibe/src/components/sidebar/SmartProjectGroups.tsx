"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, ChevronRight, Zap, Clock, FolderOpen } from "lucide-react"
import { type Project } from "@/contexts/ProjectContext"
import { RichProjectCard } from "./RichProjectCard"
import { getIconComponent } from "@sentryvibe/agent-core/lib/icon-mapper"

interface SmartProjectGroupsProps {
  projects: Project[]
  onStartServer: (projectId: string) => void
  onStopServer: (projectId: string) => void
  onRename: (project: { id: string; name: string }) => void
  onDelete: (project: { id: string; name: string; slug: string }) => void
}

export function SmartProjectGroups({
  projects,
  onStartServer,
  onStopServer,
  onRename,
  onDelete
}: SmartProjectGroupsProps) {
  const searchParams = useSearchParams()
  const currentProjectSlug = searchParams?.get('project') ?? null

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['active', 'recent']) // Expand active and recent by default
  )

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(section)) {
        newSet.delete(section)
      } else {
        newSet.add(section)
      }
      return newSet
    })
  }

  // Categorize projects
  const activeProjects = projects.filter(
    p => p.status === 'in_progress' || p.devServerStatus === 'running'
  )

  const recentProjects = projects
    .filter(p => p.status === 'completed' && p.devServerStatus !== 'running')
    .sort((a, b) => {
      const dateA = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0
      const dateB = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0
      return dateB - dateA
    })
    .slice(0, 5) // Top 5 recent

  const projectIdsInSections = new Set(
    [...activeProjects, ...recentProjects].map(p => p.id)
  )

  const allProjects = projects.filter(
    p => !projectIdsInSections.has(p.id)
  )

  const sections = [
    {
      id: 'active',
      title: 'Active',
      icon: Zap,
      count: activeProjects.length,
      projects: activeProjects,
      color: 'text-green-400',
      emptyMessage: 'No active projects'
    },
    {
      id: 'recent',
      title: 'Recent',
      icon: Clock,
      count: recentProjects.length,
      projects: recentProjects,
      color: 'text-blue-400',
      emptyMessage: 'No recent projects'
    },
    {
      id: 'all',
      title: 'All Projects',
      icon: FolderOpen,
      count: allProjects.length,
      projects: allProjects,
      color: 'text-gray-400',
      emptyMessage: 'No other projects'
    }
  ]

  return (
    <div className="space-y-2">
      {sections.map(section => {
        const SectionIcon = section.icon
        const isExpanded = expandedSections.has(section.id)
        const hasProjects = section.projects.length > 0

        return (
          <div key={section.id} className="border-t border-white/5 first:border-t-0">
            {/* Section Header */}
            <button
              onClick={() => toggleSection(section.id)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors group"
            >
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 text-gray-500 transition-transform" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-gray-500 transition-transform" />
                )}
                <SectionIcon className={`w-4 h-4 ${section.color}`} />
                <span className="text-sm font-medium text-white">{section.title}</span>
              </div>
              <span className="text-xs text-gray-500 group-hover:text-gray-400 transition-colors">
                {section.count}
              </span>
            </button>

            {/* Section Content */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  {hasProjects ? (
                    <div className="py-2 space-y-1">
                      {section.projects.map(project => (
                        <RichProjectCard
                          key={project.id}
                          project={project}
                          icon={getIconComponent(project.icon)}
                          compact
                          isCurrentProject={project.slug === currentProjectSlug}
                          onStartServer={() => onStartServer(project.id)}
                          onStopServer={() => onStopServer(project.id)}
                          onRename={() => onRename({ id: project.id, name: project.name || 'Untitled Project' })}
                          onDelete={() => onDelete({ id: project.id, name: project.name || 'Untitled Project', slug: project.slug })}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="px-3 py-4 text-center">
                      <p className="text-xs text-gray-500">{section.emptyMessage}</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}
