"use client"

import { motion } from "framer-motion"
import { Sparkles, Zap, Database, Globe, Code } from "lucide-react"

const templates = [
  {
    id: 'react-vite',
    name: 'React + Vite',
    description: 'Fast modern web app',
    icon: Zap,
    color: 'from-blue-500 to-cyan-500',
    prompt: 'Create a React + Vite app with TypeScript'
  },
  {
    id: 'nextjs',
    name: 'Next.js',
    description: 'Full-stack framework',
    icon: Globe,
    color: 'from-purple-500 to-pink-500',
    prompt: 'Create a Next.js app with TypeScript and Tailwind'
  },
  {
    id: 'express-api',
    name: 'Express API',
    description: 'REST API server',
    icon: Database,
    color: 'from-green-500 to-emerald-500',
    prompt: 'Create an Express.js REST API with TypeScript'
  },
  {
    id: 'fullstack',
    name: 'Full Stack',
    description: 'React + Node.js',
    icon: Code,
    color: 'from-orange-500 to-red-500',
    prompt: 'Create a full-stack app with React frontend and Express backend'
  },
]

export function TemplateGallery() {
  const handleTemplateClick = (prompt: string) => {
    // Navigate to home with template prompt
    window.location.href = `/?prompt=${encodeURIComponent(prompt)}`
  }

  return (
    <div className="px-3 py-2">
      <div className="grid grid-cols-2 gap-2">
        {templates.map((template, index) => {
          const Icon = template.icon
          return (
            <motion.button
              key={template.id}
              onClick={() => handleTemplateClick(template.prompt)}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="relative p-3 rounded-lg bg-gradient-to-br from-white/5 to-white/10 border border-white/10 hover:border-white/20 transition-all group text-left overflow-hidden"
            >
              {/* Gradient background on hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${template.color} opacity-0 group-hover:opacity-10 transition-opacity`} />

              <div className="relative">
                <Icon className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors mb-2" />
                <div className="text-xs font-medium text-white mb-0.5 truncate">
                  {template.name}
                </div>
                <div className="text-[10px] text-gray-500 truncate">
                  {template.description}
                </div>
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
