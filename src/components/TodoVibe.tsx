'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Loader2, Sparkles } from 'lucide-react';

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

interface TodoVibeProps {
  todos: TodoItem[];
  title?: string;
}

export default function TodoVibe({ todos, title = 'Project Tasks' }: TodoVibeProps) {
  const completed = todos.filter(t => t.status === 'completed').length;
  const total = todos.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-950/40 via-gray-900/90 to-gray-900/90 shadow-2xl backdrop-blur-sm"
    >
      {/* Header with gradient accent */}
      <div className="relative border-b border-purple-500/20 bg-gradient-to-r from-purple-500/10 to-pink-500/10 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/20 text-purple-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{title}</h3>
              <p className="text-sm text-gray-400">
                {completed} of {total} complete
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-purple-400">{Math.round(progress)}%</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-800">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
          />
        </div>
      </div>

      {/* Todo list */}
      <div className="p-6">
        <AnimatePresence mode="popLayout">
          {todos.map((todo, index) => (
            <motion.div
              key={`${todo.content}-${index}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ delay: index * 0.05 }}
              className="group mb-3 last:mb-0"
            >
              <div
                className={`flex items-start gap-3 rounded-lg border p-4 transition-all ${
                  todo.status === 'completed'
                    ? 'border-green-500/30 bg-green-950/20'
                    : todo.status === 'in_progress'
                      ? 'border-purple-500/30 bg-purple-950/20 shadow-lg shadow-purple-500/10'
                      : 'border-gray-700/50 bg-gray-800/30'
                }`}
              >
                {/* Status icon */}
                <div className="mt-0.5 flex-shrink-0">
                  {todo.status === 'completed' ? (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    >
                      <CheckCircle2 className="h-5 w-5 text-green-400" />
                    </motion.div>
                  ) : todo.status === 'in_progress' ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    >
                      <Loader2 className="h-5 w-5 text-purple-400" />
                    </motion.div>
                  ) : (
                    <Circle className="h-5 w-5 text-gray-500" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      todo.status === 'completed'
                        ? 'text-gray-400 line-through'
                        : todo.status === 'in_progress'
                          ? 'text-white'
                          : 'text-gray-300'
                    }`}
                  >
                    {todo.status === 'in_progress' ? todo.activeForm : todo.content}
                  </p>

                  {/* Progress indicator for in-progress items */}
                  {todo.status === 'in_progress' && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mt-2 h-1 overflow-hidden rounded-full bg-gray-700"
                    >
                      <motion.div
                        animate={{
                          x: ['-100%', '100%'],
                        }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                        className="h-full w-1/3 bg-gradient-to-r from-transparent via-purple-400 to-transparent"
                      />
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Completion celebration */}
      <AnimatePresence>
        {progress === 100 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-sm"
          >
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                rotate: [0, 10, -10, 0],
              }}
              transition={{ duration: 0.5 }}
              className="text-center"
            >
              <Sparkles className="mx-auto h-16 w-16 text-purple-400" />
              <p className="mt-4 text-2xl font-bold text-white">All Done! ✨</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
