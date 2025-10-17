'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, Sparkles, ChevronDown, ChevronUp, X, List, Activity } from 'lucide-react';
import type { AgentId } from '@sentryvibe/agent-core/types/agent';

export type ViewMode = 'todos' | 'activity';

interface BuildHeaderProps {
  projectName: string;
  agentId?: AgentId;
  completed: number;
  total: number;
  progress: number;
  isComplete: boolean;
  isActive: boolean;
  isCardExpanded: boolean;
  onToggleExpand: () => void;
  onClose?: () => void;
  templateInfo?: {
    name: string;
    framework: string;
    analyzedBy?: string;
  } | null;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  hasTimeline?: boolean;
}

export function BuildHeader({
  projectName,
  agentId,
  completed,
  total,
  progress,
  isComplete,
  isActive,
  isCardExpanded,
  onToggleExpand,
  onClose,
  templateInfo,
  viewMode = 'todos',
  onViewModeChange,
  hasTimeline = false,
}: BuildHeaderProps) {
  const agentLabel = agentId === 'openai-codex' ? 'Codex' : 'Claude Code';

  return (
    <>
      {/* Header - Always clickable when there are todos */}
      <div
        className={`relative border-b border-purple-500/20 bg-gradient-to-r from-purple-500/10 to-pink-500/10 px-4 py-3 ${
          total > 0 ? 'cursor-pointer hover:bg-purple-500/5 transition-colors' : ''
        }`}
        onClick={() => total > 0 && onToggleExpand()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/20 text-purple-400">
              {isComplete ? (
                <CheckCircle2 className="h-5 w-5 text-green-400" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                {isComplete ? '✓ Build Complete!' : `Building ${projectName}`}
              </h3>
              {isCardExpanded ? (
                <div className="space-y-1">
                  <p className="text-xs text-gray-400">
                    {completed} of {total} complete
                  </p>
                  {templateInfo && (
                    <p className="text-xs text-purple-300/80">
                      {templateInfo.framework}
                      {templateInfo.analyzedBy && ` • Selected by ${templateInfo.analyzedBy}`}
                      {agentId && ` • ${agentLabel}`}
                    </p>
                  )}
                  {!templateInfo && agentId && (
                    <p className="text-xs text-purple-300/80">{agentLabel}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-400">
                  {completed} of {total} complete • Click to expand
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* View mode toggle (only show if timeline data is available) */}
            {hasTimeline && onViewModeChange && isCardExpanded && (
              <div className="flex items-center gap-1 mr-2 p-1 bg-gray-800/50 rounded-lg border border-gray-700/50">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewModeChange('todos');
                  }}
                  className={`p-1.5 rounded transition-all ${
                    viewMode === 'todos'
                      ? 'bg-purple-500/20 text-purple-300'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                  title="Todo View"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewModeChange('activity');
                  }}
                  className={`p-1.5 rounded transition-all ${
                    viewMode === 'activity'
                      ? 'bg-purple-500/20 text-purple-300'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                  title="Activity Feed"
                >
                  <Activity className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="text-right">
              <div className={`text-xl font-bold ${isComplete ? 'text-green-400' : 'text-purple-400'}`}>
                {Math.round(progress)}%
              </div>
            </div>
            {total > 0 && (
              <div className="ml-2">
                {isCardExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </div>
            )}
            {!isActive && onClose && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="p-1.5 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-800">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
          />
        </div>
      </div>
    </>
  );
}
