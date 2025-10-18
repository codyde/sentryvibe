'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TodoItem, ToolCall, TextMessage } from '@/types/generation';
import { ToolCallMiniCard } from './ToolCallMiniCard';

interface TodoListProps {
  todos: TodoItem[];
  toolsByTodo: Record<number, ToolCall[]>;
  textByTodo: Record<number, TextMessage[]>;
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
          const isExpanded = expandedTodos.has(index);
          const isActive = index === activeTodoIndex;
          const hasContent = tools.length > 0; // Only tools, no text messages
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
              {/* Todo Item */}
              <button
                onClick={() => onToggleTodo(index)}
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

              {/* Nested content (text messages + tools) */}
              <AnimatePresence>
                {isExpanded && hasContent && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mt-2 space-y-2"
                  >
                    {/* Tools only - no text messages */}
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
  );
}
