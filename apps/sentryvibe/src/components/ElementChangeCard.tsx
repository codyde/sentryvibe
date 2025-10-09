'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { MousePointerClick, CheckCircle2, Loader2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface ToolCallRowProps {
  tool: {
    name: string;
    input?: any;
    output?: any;
    status: 'running' | 'completed' | 'failed';
  };
}

function ToolCallRow({ tool }: ToolCallRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getSummary = (): string => {
    if (!tool.input) return '';
    const inputObj = tool.input as any;

    if (inputObj.command) {
      const cmd = inputObj.command as string;
      return cmd.length > 60 ? cmd.substring(0, 60) + '...' : cmd;
    }
    if (inputObj.file_path) return inputObj.file_path as string;
    if (inputObj.path) return inputObj.path as string;
    return '';
  };

  const summary = getSummary();

  const getStatusColor = () => {
    switch (tool.status) {
      case 'completed':
        return 'border-green-500/30 bg-green-500/5';
      case 'failed':
        return 'border-red-500/30 bg-red-500/5';
      default:
        return 'border-yellow-500/30 bg-yellow-500/5';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`border rounded overflow-hidden ${getStatusColor()}`}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {tool.status === 'completed' ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
          ) : tool.status === 'failed' ? (
            <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          ) : (
            <Loader2 className="w-3.5 h-3.5 text-yellow-400 animate-spin flex-shrink-0" />
          )}
          <span className="text-xs font-medium text-white">{tool.name}</span>
          {summary && (
            <span className="text-xs text-gray-400 font-mono truncate">{summary}</span>
          )}
        </div>
        {(tool.input || tool.output) && (
          <div className="flex-shrink-0 ml-2">
            {isExpanded ? (
              <ChevronUp className="w-3 h-3 text-gray-400" />
            ) : (
              <ChevronDown className="w-3 h-3 text-gray-400" />
            )}
          </div>
        )}
      </button>

      {/* Expanded Details */}
      <AnimatePresence>
        {isExpanded && (tool.input || tool.output) && (
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
    </motion.div>
  );
}

interface ElementChangeCardProps {
  elementSelector: string;
  changeRequest: string;
  elementInfo?: {
    tagName?: string;
    className?: string;
    textContent?: string;
  };
  status: 'processing' | 'completed' | 'failed';
  toolCalls?: Array<{
    name: string;
    input?: any;
    output?: any;
    status: 'running' | 'completed' | 'failed';
  }>;
  error?: string;
}

export default function ElementChangeCard({
  elementSelector,
  changeRequest,
  elementInfo,
  status,
  toolCalls = [],
  error
}: ElementChangeCardProps) {
  const [isExpanded, setIsExpanded] = useState(status !== 'completed'); // Auto-collapse when done

  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-400" />;
      default:
        return <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'completed':
        return 'border-green-500/30 bg-green-500/5';
      case 'failed':
        return 'border-red-500/30 bg-red-500/5';
      default:
        return 'border-yellow-500/30 bg-yellow-500/5';
    }
  };

  const isClickable = status === 'completed' || status === 'failed';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`border rounded-lg overflow-hidden ${getStatusColor()}`}
    >
      {/* Header - Clickable when completed */}
      <div
        className={`p-4 flex items-start gap-3 ${isClickable ? 'cursor-pointer hover:bg-white/5 transition-colors' : ''}`}
        onClick={() => isClickable && setIsExpanded(!isExpanded)}
      >
        <div className="flex-shrink-0 mt-1">
          {getStatusIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <MousePointerClick className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-white">Element Change</h3>
            {isClickable && !isExpanded && (
              <span className="text-xs text-gray-500 ml-auto">Click to expand</span>
            )}
          </div>

          {/* Collapsed Summary */}
          {!isExpanded && (
            <div className="text-sm text-white">
              <span className="text-gray-400">Changed:</span> {changeRequest}
            </div>
          )}

          {/* Expanded Details */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                {/* Element Info */}
                <div className="space-y-2 mb-3 mt-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500">Target:</span>
                    <code className="px-2 py-0.5 bg-black/40 rounded text-purple-300 font-mono">
                      {elementSelector}
                    </code>
                    {elementInfo?.tagName && (
                      <span className="text-gray-600">&lt;{elementInfo.tagName}&gt;</span>
                    )}
                  </div>
                  {elementInfo?.textContent && (
                    <div className="text-xs text-gray-400 truncate">
                      "{elementInfo.textContent.substring(0, 80)}..."
                    </div>
                  )}
                </div>

                {/* Change Request */}
                <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                  <p className="text-sm text-white">{changeRequest}</p>
                </div>

                {/* Status Message */}
                <div className="mt-3 text-xs text-gray-400">
                  {status === 'processing' && 'Applying changes...'}
                  {status === 'completed' && '✓ Changes applied successfully'}
                  {status === 'failed' && `✗ Failed: ${error || 'Unknown error'}`}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Expand/Collapse indicator when clickable */}
        {isClickable && (
          <div className="flex-shrink-0">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </div>
        )}
      </div>

      {/* Tool Calls - Only show when expanded */}
      {isExpanded && toolCalls.length > 0 && (
        <div className="border-t border-white/10 px-4 py-3 space-y-1">
          {toolCalls.map((tool, i) => (
            <ToolCallRow key={i} tool={tool} />
          ))}
        </div>
      )}
    </motion.div>
  );
}
