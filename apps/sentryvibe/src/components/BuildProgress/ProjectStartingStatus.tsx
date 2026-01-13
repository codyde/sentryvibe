'use client';

import { motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import { getFrameworkLogo } from '@/lib/framework-logos';
import { getModelLogo } from '@/lib/model-logos';

interface ProjectStartingStatusProps {
  projectName?: string;
  framework?: string;
  isSelectingTemplate?: boolean;
  isDownloadingTemplate?: boolean;
  templateName?: string;
  modelId?: string;
  agentId?: string;
}

/**
 * Inline status component that shows project initialization progress
 * Replaces the blocking full-screen spinner with a compact, informative display
 */
export function ProjectStartingStatus({
  projectName,
  framework,
  isSelectingTemplate,
  isDownloadingTemplate,
  templateName,
  modelId,
  agentId,
}: ProjectStartingStatusProps) {
  const frameworkLogo = framework ? getFrameworkLogo(framework) : null;
  const modelLogo = modelId ? getModelLogo(modelId) : null;

  // Determine current status
  const steps = [
    {
      id: 'create',
      label: 'Created project',
      detail: projectName,
      done: !!projectName,
      active: !projectName,
    },
    {
      id: 'template',
      label: framework ? 'Selected template' : 'Selecting template',
      detail: templateName || framework,
      done: !!framework && !isSelectingTemplate,
      active: isSelectingTemplate,
    },
    {
      id: 'download',
      label: isDownloadingTemplate ? 'Downloading template' : 'Ready to build',
      detail: isDownloadingTemplate ? templateName : undefined,
      done: !isDownloadingTemplate && !!framework,
      active: isDownloadingTemplate,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="rounded-lg border border-white/10 bg-black/30 backdrop-blur-sm overflow-hidden"
    >
      {/* Header with model/framework badges */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-white/5">
        <span className="text-xs text-gray-400">Starting project</span>
        <div className="flex-1" />
        
        {/* Model badge */}
        {(modelId || agentId) && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-800/50 rounded text-xs">
            {modelLogo && (
              <img src={modelLogo} alt="" className="w-3 h-3 object-contain" />
            )}
            <span className="text-gray-400">
              {agentId === 'openai-codex' ? 'codex' : modelId?.replace('claude-', '')}
            </span>
          </div>
        )}
        
        {/* Framework badge - appears immediately when known */}
        {framework && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-800/50 rounded text-xs"
          >
            {frameworkLogo && (
              <img src={frameworkLogo} alt="" className="w-3 h-3 object-contain" />
            )}
            <span className="text-gray-300">{framework}</span>
          </motion.div>
        )}
      </div>

      {/* Progress steps */}
      <div className="px-4 py-3 space-y-2">
        {steps.map((step) => (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 text-sm"
          >
            {/* Status icon */}
            {step.done ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : step.active ? (
              <Loader2 className="w-4 h-4 text-theme-primary animate-spin" />
            ) : (
              <div className="w-4 h-4 rounded-full border border-gray-600" />
            )}
            
            {/* Label */}
            <span className={step.done ? 'text-gray-400' : step.active ? 'text-white' : 'text-gray-500'}>
              {step.label}
            </span>
            
            {/* Detail */}
            {step.detail && (step.done || step.active) && (
              <span className="text-gray-500 text-xs font-mono truncate max-w-[200px]">
                {step.detail}
              </span>
            )}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
