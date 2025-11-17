'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Loader2, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { TodoItem, ToolCall, TextMessage } from '@/types/generation';
import { ToolCallMiniCard } from './ToolCallMiniCard';

// Collapsible text update card component
function TextUpdateCard({ message }: { message: TextMessage }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const previewText = message.text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#+ /g, '')
    .replace(/\n/g, ' ')
    .trim()
    .substring(0, 60);

  const needsEllipsis = message.text.length > 60;

  return (
    <div className="ml-6 rounded-md border border-purple-500/20 bg-purple-950/10 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-purple-500/5 transition-colors"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <MessageSquare className="w-3 h-3 text-purple-400 flex-shrink-0" />
          <p className="text-xs text-gray-300 truncate">
            {previewText}{needsEllipsis && '...'}
          </p>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-3 h-3 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
        )}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 pt-1 border-t border-purple-500/10 text-xs">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  p: ({ children }) => <p className="text-gray-300 leading-relaxed mb-1.5 last:mb-0">{children}</p>,
                  strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                  code: ({ children }) => <code className="px-1 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono text-xs">{children}</code>,
                  ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 text-gray-300">{children}</ul>,
                  li: ({ children }) => <li className="text-xs">{children}</li>,
                }}
              >
                {message.text}
              </ReactMarkdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface TodoListProps {
  todos: TodoItem[];
  toolsByTodo: Record<number, ToolCall[]>;
  textByTodo: Record<number, TextMessage[]>; // Keep for now for backward compat, but don't display
  activeTodoIndex: number;
  expandedTodos: Set<number>;
  onToggleTodo: (index: number) => void;
  allTodosCompleted: boolean;
  onViewFiles?: () => void;
  onStartServer?: () => void;
}

export function TodoList({
  todos,
  toolsByTodo,
  textByTodo,
  activeTodoIndex,
  expandedTodos,
  onToggleTodo,
  allTodosCompleted,
  onViewFiles,
  onStartServer,
}: TodoListProps) {
  return (
    <div className="p-3">
      <AnimatePresence mode="popLayout">
        {todos.map((todo, index) => {
          const tools = toolsByTodo[index] || [];
          // textByTodo no longer displayed - text messages go to Chat tab
          const isExpanded = expandedTodos.has(index);
          const isActive = index === activeTodoIndex;
          const hasContent = tools.length > 0; // Only tools determine if there's content to show
          const isLastTodo = index === todos.length - 1;
          const isFinalSummary = isLastTodo && allTodosCompleted;

          return (
            <motion.div
              key={`${todo.content}-${index}`}
              data-todo-index={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ delay: index * 0.05 }}
              className="mb-2 last:mb-0"
            >
              {/* Todo Item - Minimal tree-view style */}
              <button
                onClick={() => onToggleTodo(index)}
                className="w-full flex items-center gap-2 px-2 py-1.5 transition-all text-left hover:bg-white/5 rounded"
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
                  {hasContent && !isExpanded && (
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      ({tools.length} {tools.length === 1 ? 'tool' : 'tools'})
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

              {/* Nested content - Tree-view style with connecting lines */}
              <AnimatePresence>
                {isExpanded && hasContent && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mt-2 space-y-2 relative"
                  >
                    <div className="ml-6 space-y-1.5 relative">
                      {/* Vertical connecting line */}
                      <div className="absolute left-0 top-0 bottom-2 w-px bg-gray-700/50" />

                      {/* Tool Calls with horizontal branch lines */}
                      {tools.map((tool, toolIdx) => (
                        <div key={tool.id} className="relative pl-4">
                          {/* Horizontal branch line */}
                          <div className="absolute left-0 top-3 w-3 h-px bg-gray-700/50" />
                          <ToolCallMiniCard tool={tool} />
                        </div>
                      ))}
                    </div>

                    {/* Removed action buttons from completed builds */}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
