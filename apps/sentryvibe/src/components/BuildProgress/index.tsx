'use client';

import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useState, useEffect, useMemo, useRef } from 'react';
import type { GenerationState } from '@/types/generation';
import { BuildHeader } from './BuildHeader';
import { TodoList } from './TodoList';

interface BuildProgressProps {
  state: GenerationState;
  defaultCollapsed?: boolean;
  onClose?: () => void;
  onViewFiles?: () => void;
  onStartServer?: () => void;
  templateInfo?: {
    name: string;
    framework: string;
    analyzedBy?: string;
  } | null;
}

export default function BuildProgress({
  state,
  defaultCollapsed = false,
  onClose,
  onViewFiles,
  onStartServer,
  templateInfo,
}: BuildProgressProps) {
  // ALWAYS call hooks first (React rules!)
  const [expandedTodos, setExpandedTodos] = useState<Set<number>>(new Set());
  const [isCardExpanded, setIsCardExpanded] = useState(!defaultCollapsed);
  const todoListRef = useRef<HTMLDivElement>(null);
  const activeTodoRef = useRef<HTMLDivElement>(null);

  const completed = state?.todos?.filter((t) => t.status === 'completed').length || 0;
  const total = state?.todos?.length || 0;
  const progress = total > 0 ? (completed / total) * 100 : 0;
  const isComplete = progress === 100 && !state?.isActive;

  // Debug logging for state
  useEffect(() => {
    console.log('🔍 BuildProgress state update:', {
      todosLength: state?.todos?.length || 0,
      isActive: state?.isActive,
      activeTodoIndex: state?.activeTodoIndex,
      agentId: state?.agentId,
      claudeModelId: state?.claudeModelId,
      projectName: state?.projectName,
    });

    if (state?.toolsByTodo) {
      const toolCounts = Object.keys(state.toolsByTodo)
        .map((idx) => `todo${idx}: ${state.toolsByTodo[Number(idx)]?.length || 0} tools`)
        .join(', ');
      console.log('   📊 toolsByTodo:', toolCounts || 'empty');
    }
  }, [state]);

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

    setExpandedTodos((prev) => {
      const next = new Set(prev);

      // Expand ONLY the active todo
      state.todos.forEach((todo, index) => {
        if (index === state.activeTodoIndex && todo.status === 'in_progress') {
          next.add(index);
        } else if (todo.status === 'completed') {
          // Auto-collapse completed todos
          next.delete(index);
        } else if (todo.status === 'pending') {
          // Keep pending todos collapsed
          next.delete(index);
        }
      });

      return next;
    });
  }, [state?.activeTodoIndex, state?.todos]);

  // Auto-scroll to active todo when it changes
  useEffect(() => {
    if (!state?.isActive || state.activeTodoIndex < 0) return;

    // Small delay to let the DOM update
    const timer = setTimeout(() => {
      const activeElement = document.querySelector(`[data-todo-index="${state.activeTodoIndex}"]`);
      if (activeElement && todoListRef.current) {
        activeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest',
        });
        console.log(`📜 Auto-scrolled to active todo: ${state.activeTodoIndex}`);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [state?.activeTodoIndex, state?.isActive]);

  // Removed auto-switch logic - ONLY todo view now!

  // ALL useMemo/useCallback MUST be before early returns
  const allTodosCompleted = useMemo(() => {
    return state.todos?.length ? state.todos.every((todo) => todo.status === 'completed') : false;
  }, [state.todos]);

  const toggleTodo = (index: number) => {
    setExpandedTodos((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Validate state AFTER ALL hooks
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

  // Show initializing state ONLY if no todos yet
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

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full overflow-hidden rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-950/40 via-gray-900/95 to-gray-900/95 shadow-2xl backdrop-blur-sm"
    >
      <BuildHeader
        projectName={state.projectName}
        agentId={state.agentId}
        claudeModelId={state.claudeModelId}
        completed={completed}
        total={total}
        progress={progress}
        isComplete={isComplete}
        isActive={state.isActive}
        isCardExpanded={isCardExpanded}
        onToggleExpand={() => setIsCardExpanded(!isCardExpanded)}
        onClose={onClose}
        templateInfo={templateInfo}
      />

      {/* Content - Only show when expanded */}
      {isCardExpanded && (
        <>
          {total > 0 ? (
            <div ref={todoListRef}>
              <TodoList
                todos={state.todos}
                toolsByTodo={state.toolsByTodo}
                textByTodo={state.textByTodo}
                activeTodoIndex={state.activeTodoIndex}
                expandedTodos={expandedTodos}
                onToggleTodo={toggleTodo}
                allTodosCompleted={allTodosCompleted}
                onViewFiles={onViewFiles}
                onStartServer={onStartServer}
              />
            </div>
          ) : (
            <div className="p-6 text-center text-gray-400 text-sm">
              {state.isActive ? 'Initializing build...' : 'No tasks to display'}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
