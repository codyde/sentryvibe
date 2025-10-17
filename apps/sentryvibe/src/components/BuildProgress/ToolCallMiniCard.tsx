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

  // Get summary from input
  const getSummary = (): string => {
    if (!tool.input) return '';
    const inputObj = tool.input as any;

    if (inputObj.command) {
      const cmd = inputObj.command as string;
      return cmd.length > 50 ? cmd.substring(0, 50) + '...' : cmd;
    }
    if (inputObj.file_path) return inputObj.file_path as string;
    if (inputObj.path) return inputObj.path as string;
    return '';
  };

  const summary = getSummary();

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
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
            <span className="text-xs font-medium">{tool.name}</span>
            {summary && (
              <span className="text-xs text-gray-400 font-mono truncate">{summary}</span>
            )}
          </div>
          {(tool.input !== undefined || tool.output !== undefined) && (
            <div className="flex-shrink-0 ml-2">
              {isExpanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </div>
          )}
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
