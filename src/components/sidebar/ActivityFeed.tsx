"use client"

import { motion } from "framer-motion"
import { Activity, Server, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react"
import { type Project } from "@/contexts/ProjectContext"

interface ActivityFeedProps {
  projects: Project[]
}

export function ActivityFeed({ projects }: ActivityFeedProps) {
  // Get active projects (building or running)
  const buildingProjects = projects.filter(p => p.status === 'in_progress')
  const runningServers = projects.filter(p => p.devServerStatus === 'running')
  const failedProjects = projects.filter(p => p.status === 'failed' || p.devServerStatus === 'failed')

  const hasActivity = buildingProjects.length > 0 || runningServers.length > 0 || failedProjects.length > 0

  if (!hasActivity) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="px-4 py-6 text-center"
      >
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <Activity className="w-8 h-8 mx-auto mb-2 text-gray-600" />
        </motion.div>
        <p className="text-xs text-gray-500">No active projects</p>
        <p className="text-[10px] text-gray-600 mt-1">Start building to see activity</p>
      </motion.div>
    )
  }

  return (
    <div className="px-3 py-2 space-y-2">
      {/* Building Projects */}
      {buildingProjects.map((project) => (
        <motion.a
          key={project.id}
          href={`/?project=${project.slug}`}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="block p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/15 transition-colors"
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white truncate">
                  {project.name}
                </span>
              </div>
              <p className="text-xs text-yellow-300/80 mt-0.5">
                Building project...
              </p>
            </div>
          </div>
        </motion.a>
      ))}

      {/* Running Servers */}
      {runningServers.map((project) => (
        <motion.a
          key={project.id}
          href={`/?project=${project.slug}`}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="block p-3 rounded-lg bg-green-500/10 border border-green-500/30 hover:bg-green-500/15 transition-colors"
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <div className="relative">
                <Server className="w-4 h-4 text-green-400" />
                <motion.div
                  className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full"
                  animate={{ scale: [1, 1.2, 1], opacity: [1, 0.5, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white truncate">
                  {project.name}
                </span>
              </div>
              <p className="text-xs text-green-300/80 mt-0.5">
                Running on :{project.devServerPort || project.port || '????'}
              </p>
            </div>
          </div>
        </motion.a>
      ))}

      {/* Failed Projects */}
      {failedProjects.map((project) => (
        <motion.a
          key={project.id}
          href={`/?project=${project.slug}`}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="block p-3 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/15 transition-colors"
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white truncate">
                  {project.name}
                </span>
              </div>
              <p className="text-xs text-red-300/80 mt-0.5 truncate">
                {project.errorMessage || 'Build failed'}
              </p>
            </div>
          </div>
        </motion.a>
      ))}
    </div>
  )
}
