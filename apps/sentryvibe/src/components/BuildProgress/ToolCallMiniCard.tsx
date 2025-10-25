'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { ToolCall } from '@/types/generation';

interface ToolCallMiniCardProps {
  tool: ToolCall;
}

export function ToolCallMiniCard({ tool }: ToolCallMiniCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusColor = () => {
    switch (tool.state) {
      case 'input-streaming':
      case 'input-available':
        return 'text-[#FFD00E] border-[#FFD00E]/30 bg-[#FFD00E]/5';
      case 'output-available':
        return 'text-[#92DD00] border-[#92DD00]/30 bg-[#92DD00]/5';
      default:
        return 'text-gray-400 border-gray-500/30 bg-gray-500/5';
    }
  };

  const getStatusIcon = () => {
    if (tool.state === 'output-available') return CheckCircle2;
    return Loader2;
  };

  const StatusIcon = getStatusIcon();
  const isRunning = tool.state === 'input-available' || tool.state === 'input-streaming';

  // Get summary from input with relative paths
  const getSummary = (): string => {
    if (!tool.input) return '';
    const inputObj = tool.input as any;

    if (inputObj.command) {
      const cmd = inputObj.command as string;
      return cmd.length > 50 ? cmd.substring(0, 50) + '...' : cmd;
    }

    // For file operations, show relative path from workspace
    if (inputObj.file_path) {
      const fullPath = inputObj.file_path as string;
      // Extract project-relative path: /Users/.../sentryvibe-workspace/my-project/src/app.tsx → my-project/src/app.tsx
      const workspaceMatch = fullPath.match(/sentryvibe-workspace\/(.+)$/);
      return workspaceMatch ? workspaceMatch[1] : fullPath;
    }

    if (inputObj.path) {
      const fullPath = inputObj.path as string;
      const workspaceMatch = fullPath.match(/sentryvibe-workspace\/(.+)$/);
      return workspaceMatch ? workspaceMatch[1] : fullPath;
    }

    if (inputObj.pattern) return inputObj.pattern as string;
    return '';
  };

  const summary = getSummary();

  // Calculate duration if available
  const duration = tool.endTime && tool.startTime
    ? ((tool.endTime.getTime() - tool.startTime.getTime()) / 1000).toFixed(2) + 's'
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.15 }}
      className="ml-8 mb-2"
    >
      <div className={`border rounded-lg overflow-hidden ${getStatusColor()}`}>
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <StatusIcon className={`w-3.5 h-3.5 flex-shrink-0 ${isRunning ? 'animate-spin' : ''}`} />
            <span className="text-xs font-semibold">{tool.name}</span>
            {summary && (
              <span className="text-xs text-gray-400 font-mono truncate max-w-md">{summary}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {duration && (
              <span className="text-xs text-gray-500 font-mono">{duration}</span>
            )}
            {(tool.input !== undefined || tool.output !== undefined) && (
              <div className="ml-1">
                {isExpanded ? (
                  <ChevronUp className="w-3 h-3 text-gray-500" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-gray-500" />
                )}
              </div>
            )}
          </div>
        </button>

        {/* Expanded Content */}
        <AnimatePresence>
          {isExpanded && (tool.input !== undefined || tool.output !== undefined) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-white/10"
            >
              <div className="px-3 py-2 space-y-2 max-h-40 overflow-y-auto">
                {tool.input !== undefined && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Input:</div>
                    <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap bg-black/30 rounded p-2">
                      {typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input, null, 2)}
                    </pre>
                  </div>
                )}
                {tool.output !== undefined && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Output:</div>
                    <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap bg-black/30 rounded p-2 max-h-20 overflow-auto">
                      {typeof tool.output === 'string' ? tool.output : JSON.stringify(tool.output, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
