'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Loader2, Sparkles, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { GenerationState, ToolCall } from '@/types/generation';

interface GenerationProgressProps {
  state: GenerationState;
  defaultCollapsed?: boolean;
  onClose?: () => void;
  onViewFiles?: () => void;
  onStartServer?: () => void;
  templateInfo?: {
    name: string;
    framework: string;
    analyzedBy: string;
  } | null;
}

interface ToolCallMiniCardProps {
  tool: ToolCall;
}

function ToolCallMiniCard({ tool }: ToolCallMiniCardProps) {
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

export default function GenerationProgress({ state, defaultCollapsed = false, onClose, onViewFiles, onStartServer, templateInfo }: GenerationProgressProps) {
  // ALWAYS call hooks first (React rules!)
  const [expandedTodos, setExpandedTodos] = useState<Set<number>>(new Set());
  const [isCardExpanded, setIsCardExpanded] = useState(!defaultCollapsed);

  const completed = state?.todos?.filter(t => t.status === 'completed').length || 0;
  const total = state?.todos?.length || 0;
  const progress = total > 0 ? (completed / total) * 100 : 0;
  const isComplete = progress === 100 && !state?.isActive;
  const hasAnyActivity = total > 0 || state.activeTodoIndex >= 0;

  // Debug logging for toolsByTodo
  useEffect(() => {
    if (state?.toolsByTodo) {
      const toolCounts = Object.keys(state.toolsByTodo).map(idx =>
        `todo${idx}: ${state.toolsByTodo[Number(idx)]?.length || 0} tools`
      ).join(', ');
      console.log('📊 GenerationProgress toolsByTodo:', toolCounts || 'empty');
    }
  }, [state?.toolsByTodo]);

  // Auto-collapse card when build completes (only if not defaultCollapsed)
  useEffect(() => {
    if (isComplete && !defaultCollapsed) {
      console.log('🎉 Build complete, auto-collapsing card');
      setIsCardExpanded(false);
    }
  }, [isComplete, defaultCollapsed]);

  // Auto-expand active todo, auto-collapse completed todos
  useEffect(() => {
    if (!state?.todos) return;

    setExpandedTodos(prev => {
      const next = new Set(prev);

      // Expand active todo
      if (state.activeTodoIndex >= 0) {
        next.add(state.activeTodoIndex);
      }

      // Collapse completed todos automatically
      state.todos.forEach((todo, index) => {
        if (todo.status === 'completed' && next.has(index)) {
          next.delete(index);
        }
      });

      return next;
    });
  }, [state?.activeTodoIndex, state?.todos]);

  // Validate state AFTER hooks
  if (!state || !state.todos || !Array.isArray(state.todos)) {
    console.error('⚠️ Invalid generation state:', state);
    return (
      <div className="p-4 border border-red-500/30 rounded-lg bg-red-500/10">
        <p className="text-red-400 text-sm">Invalid build state. Please try again.</p>
        {onClose && (
          <button
            onClick={onClose}
            className="mt-2 px-3 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 rounded"
          >
            Dismiss
          </button>
        )}
      </div>
    );
  }

  // Show initializing state if no todos yet
  if (total === 0 && state.isActive) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full p-6 rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-950/40 via-gray-900/95 to-gray-900/95"
      >
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
          <div>
            <h3 className="text-base font-semibold text-white">Initializing Build...</h3>
            <p className="text-xs text-gray-400">Setting up {state.projectName}</p>
          </div>
        </div>
      </motion.div>
    );
  }

  const toggleTodo = (index: number) => {
    setExpandedTodos(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const allTodosCompleted = useMemo(() => {
    return state.todos?.length ? state.todos.every(todo => todo.status === 'completed') : false;
  }, [state.todos]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full overflow-hidden rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-950/40 via-gray-900/95 to-gray-900/95 shadow-2xl backdrop-blur-sm"
    >
      {/* Header - Always clickable when there are todos */}
      <div
        className={`relative border-b border-purple-500/20 bg-gradient-to-r from-purple-500/10 to-pink-500/10 px-4 py-3 ${
          total > 0 ? 'cursor-pointer hover:bg-purple-500/5 transition-colors' : ''
        }`}
        onClick={() => total > 0 && setIsCardExpanded(!isCardExpanded)}
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
                {isComplete ? '✓ Build Complete!' : `Building ${state.projectName}`}
              </h3>
              {isCardExpanded ? (
                <div className="space-y-1">
                  <p className="text-xs text-gray-400">
                    {completed} of {total} complete
                  </p>
                  {templateInfo?.framework && templateInfo?.analyzedBy && (
                    <p className="text-xs text-purple-300/80">
                      {templateInfo.framework} • Selected by {templateInfo.analyzedBy}
                    </p>
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
            {!state.isActive && onClose && (
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

      {/* Todo list with nested tools - Only show when expanded */}
      {isCardExpanded && (
        <div className="p-3">
          <AnimatePresence mode="popLayout">
            {state.todos.map((todo, index) => {
            const tools = state.toolsByTodo[index] || [];
            const textMessages = state.textByTodo[index] || [];
            const isExpanded = expandedTodos.has(index);
            const isActive = index === state.activeTodoIndex;
            const hasContent = tools.length > 0 || textMessages.length > 0;
            const isLastTodo = index === state.todos.length - 1;
            const isFinalSummary = isLastTodo && allTodosCompleted;

            return (
              <motion.div
                key={`${todo.content}-${index}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.05 }}
                className="mb-2 last:mb-0"
              >
                {/* Todo Item */}
                <button
                  onClick={() => toggleTodo(index)}
                  className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 transition-all text-left ${
                    todo.status === 'completed'
                      ? 'border-green-500/30 bg-green-950/20'
                      : todo.status === 'in_progress'
                        ? 'border-purple-500/30 bg-purple-950/20 shadow-lg shadow-purple-500/10'
                        : 'border-gray-700/50 bg-gray-800/30'
                  }`}
                >
                  {/* Status icon */}
                  <div className="flex-shrink-0">
                    {todo.status === 'completed' ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      >
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                      </motion.div>
                    ) : todo.status === 'in_progress' ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      >
                        <Loader2 className="h-4 w-4 text-purple-400" />
                      </motion.div>
                    ) : (
                      <Circle className="h-4 w-4 text-gray-500" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <p
                      className={`text-sm font-medium truncate ${
                        todo.status === 'completed'
                          ? 'text-gray-400 line-through'
                          : todo.status === 'in_progress'
                            ? 'text-white'
                            : 'text-gray-300'
                      }`}
                    >
                      {todo.status === 'in_progress' ? todo.activeForm : todo.content}
                    </p>

                    {/* Content count indicator */}
                    {hasContent && (
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        ({tools.length} {tools.length === 1 ? 'tool' : 'tools'}
                        {textMessages.length > 0 && `, ${textMessages.length} msg`})
                      </span>
                    )}
                  </div>

                  {/* Expand indicator */}
                  {hasContent && (
                    <div className="flex-shrink-0">
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                      )}
                    </div>
                  )}
                </button>

                {/* Nested content (text messages + tools) */}
                <AnimatePresence>
                  {isExpanded && hasContent && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-2 space-y-2"
                    >
                      {/* Text messages */}
                      {textMessages.map((textMsg) => (
                        <div key={textMsg.id} className="ml-8 p-3 bg-gray-800/50 border border-gray-700/50 rounded-lg">
                          <div className="text-sm text-gray-300 prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {textMsg.text}
                            </ReactMarkdown>
                          </div>
                        </div>
                      ))}

                      {/* Tools */}
                      {tools.map((tool) => (
                        <ToolCallMiniCard key={tool.id} tool={tool} />
                      ))}

                      {/* Final Summary Actions */}
                      {isFinalSummary && todo.status === 'completed' && (
                        <div className="ml-8 mt-3 flex gap-3">
                          <button
                            onClick={onViewFiles}
                            className="flex-1 px-4 py-3 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 rounded-lg transition-colors font-medium"
                          >
                            📁 View Files
                          </button>
                          <button
                            onClick={onStartServer}
                            className="flex-1 px-4 py-3 bg-green-500/20 hover:bg-green-500/30 text-green-300 border border-green-500/30 rounded-lg transition-colors font-medium"
                          >
                            ▶️ Start Server
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      )}

    </motion.div>
  );
}
