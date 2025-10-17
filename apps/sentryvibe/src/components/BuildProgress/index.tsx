'use client';

import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import type { GenerationState } from '@/types/generation';
import { BuildHeader, type ViewMode } from './BuildHeader';
import { TodoList } from './TodoList';
import { ActivityFeed } from './ActivityFeed';

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
  const [viewMode, setViewMode] = useState<ViewMode>('todos');

  const completed = state?.todos?.filter((t) => t.status === 'completed').length || 0;
  const total = state?.todos?.length || 0;
  const progress = total > 0 ? (completed / total) * 100 : 0;
  const isComplete = progress === 100 && !state?.isActive;
  const hasTimeline = !!state?.timeline && state.timeline.length > 0;

  // Check if we have ANY activity (tools, text, etc.) even without todos
  const hasAnyActivity = useMemo(() => {
    if (hasTimeline) return true;
    const toolsCount = Object.values(state?.toolsByTodo || {}).reduce((sum, tools) => sum + tools.length, 0);
    const textCount = Object.values(state?.textByTodo || {}).reduce((sum, texts) => sum + texts.length, 0);
    return toolsCount > 0 || textCount > 0;
  }, [hasTimeline, state?.toolsByTodo, state?.textByTodo]);

  // Debug logging for state
  useEffect(() => {
    console.log('🔍 BuildProgress state update:', {
      todosLength: state?.todos?.length || 0,
      hasTimeline,
      timelineLength: state?.timeline?.length || 0,
      hasAnyActivity,
      viewMode,
      isActive: state?.isActive,
    });

    if (state?.toolsByTodo) {
      const toolCounts = Object.keys(state.toolsByTodo)
        .map((idx) => `todo${idx}: ${state.toolsByTodo[Number(idx)]?.length || 0} tools`)
        .join(', ');
      console.log('   📊 toolsByTodo:', toolCounts || 'empty');
    }
  }, [state, hasTimeline, hasAnyActivity, viewMode]);

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

  // Show initializing state ONLY if no activity at all
  if (!hasAnyActivity && state.isActive) {
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

  // Auto-switch to activity view if no todos but has activity
  useEffect(() => {
    if (total === 0 && (hasTimeline || hasAnyActivity) && viewMode === 'todos') {
      console.log('🔄 Auto-switching to Activity Feed (no todos but has activity)');
      setViewMode('activity');
    }
  }, [total, hasTimeline, hasAnyActivity, viewMode]);

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

  const allTodosCompleted = useMemo(() => {
    return state.todos?.length ? state.todos.every((todo) => todo.status === 'completed') : false;
  }, [state.todos]);

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
        completed={completed}
        total={total}
        progress={progress}
        isComplete={isComplete}
        isActive={state.isActive}
        isCardExpanded={isCardExpanded}
        onToggleExpand={() => setIsCardExpanded(!isCardExpanded)}
        onClose={onClose}
        templateInfo={templateInfo}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        hasTimeline={hasTimeline}
      />

      {/* Content - Only show when expanded */}
      {isCardExpanded && (
        <>
          {viewMode === 'todos' && total > 0 && (
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
          )}
          {viewMode === 'activity' && (hasTimeline || hasAnyActivity) && (
            <ActivityFeed
              timeline={state.timeline || []}
              isActive={state.isActive}
              toolsByTodo={state.toolsByTodo}
              textByTodo={state.textByTodo}
            />
          )}
          {/* Fallback: Show message if no content at all */}
          {!hasAnyActivity && total === 0 && (
            <div className="p-6 text-center text-gray-400 text-sm">
              Waiting for build to start...
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
