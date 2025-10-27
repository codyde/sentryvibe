'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, Sparkles, ChevronDown, ChevronUp, X } from 'lucide-react';
import {
  getClaudeModelLabel,
  DEFAULT_CLAUDE_MODEL_ID,
  type AgentId,
  type ClaudeModelId,
} from '@sentryvibe/agent-core/client';

interface BuildHeaderProps {
  projectName: string;
  agentId?: AgentId;
  claudeModelId?: ClaudeModelId;
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
}

export function BuildHeader({
  projectName,
  agentId,
  claudeModelId,
  completed,
  total,
  progress,
  isComplete,
  isActive,
  isCardExpanded,
  onToggleExpand,
  onClose,
  templateInfo,
}: BuildHeaderProps) {
  // DEBUG: Log agent values
  console.log('🔍 [BuildHeader] Agent values:', {
    agentId,
    claudeModelId,
    projectName,
    agentIdType: typeof agentId,
    agentIdValue: agentId,
    isCodex: agentId === 'openai-codex',
    isClaude: agentId === 'claude-code',
  });

  const agentLabel =
    agentId === 'openai-codex'
      ? 'OpenAI GPT-5 Codex'
      : `Claude Code • ${getClaudeModelLabel(claudeModelId ?? DEFAULT_CLAUDE_MODEL_ID)}`;

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
                <div className="space-y-0.5">
                  <p className="text-xs text-gray-400">
                    {completed} of {total} complete • Click to expand
                  </p>
                  {templateInfo && (
                    <p className="text-xs text-purple-300/70">
                      {templateInfo.framework}
                      {templateInfo.analyzedBy && ` • ${templateInfo.analyzedBy}`}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
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
