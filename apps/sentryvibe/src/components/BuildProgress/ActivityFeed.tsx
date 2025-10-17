'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Loader2, Terminal, FileEdit, FileText, FileSearch, FilePlus, ListTodo, Brain } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TimelineEvent, ToolCall, TodoItem, TextMessage } from '@/types/generation';
import { useState, useMemo } from 'react';

interface ActivityFeedProps {
  timeline: TimelineEvent[];
  isActive: boolean;
  toolsByTodo?: Record<number, ToolCall[]>;
  textByTodo?: Record<number, TextMessage[]>;
}

// Get icon for tool name
function getToolIcon(toolName: string) {
  switch (toolName) {
    case 'Bash':
    case 'command_execution':
      return <Terminal className="w-4 h-4" />;
    case 'Write':
      return <FilePlus className="w-4 h-4" />;
    case 'Edit':
      return <FileEdit className="w-4 h-4" />;
    case 'Read':
      return <FileText className="w-4 h-4" />;
    case 'Grep':
      return <FileSearch className="w-4 h-4" />;
    case 'TodoWrite':
      return <ListTodo className="w-4 h-4" />;
    default:
      return <Circle className="w-4 h-4" />;
  }
}

// Get color class for tool state
function getStateColor(state: ToolCall['state']) {
  switch (state) {
    case 'output-available':
      return 'text-green-400 border-green-500/30 bg-green-950/20';
    case 'input-available':
    case 'input-streaming':
      return 'text-purple-400 border-purple-500/30 bg-purple-950/20';
    default:
      return 'text-gray-400 border-gray-700/50 bg-gray-800/30';
  }
}

function ActivityFeedItem({ event, index }: { event: TimelineEvent; index: number }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (event.type === 'todo') {
    const todo = event.data as TodoItem;
    return (
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.02 }}
        className="flex items-center gap-3 p-2 rounded-lg border border-gray-700/30 bg-gray-800/20"
      >
        {todo.status === 'completed' ? (
          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
        ) : todo.status === 'in_progress' ? (
          <Loader2 className="w-4 h-4 text-purple-400 flex-shrink-0 animate-spin" />
        ) : (
          <Circle className="w-4 h-4 text-gray-500 flex-shrink-0" />
        )}
        <span className="text-sm text-gray-300 flex-1">{todo.content}</span>
        <span className="text-xs text-gray-500">
          {event.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </motion.div>
    );
  }

  if (event.type === 'tool') {
    const tool = event.data as ToolCall;
    const stateColor = getStateColor(tool.state);
    const duration = tool.endTime ? ((tool.endTime.getTime() - tool.startTime.getTime()) / 1000).toFixed(1) + 's' : null;
    const isComplete = tool.state === 'output-available';

    return (
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.02 }}
        className="space-y-1"
      >
        {/* Compact tool card */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`w-full flex items-center gap-3 p-2 rounded-lg border transition-all text-left ${stateColor}`}
        >
          <div className="flex-shrink-0">
            {getToolIcon(tool.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium truncate">{tool.name}</span>
              {tool.name === 'Bash' && tool.input && typeof tool.input === 'object' && 'command' in tool.input && (
                <span className="text-xs text-gray-400 truncate">
                  {String(tool.input.command).substring(0, 40)}...
                </span>
              )}
              {tool.name === 'Write' && tool.input && typeof tool.input === 'object' && 'file_path' in tool.input && (
                <span className="text-xs text-gray-400 truncate">
                  {String(tool.input.file_path)}
                </span>
              )}
              {tool.name === 'Edit' && tool.input && typeof tool.input === 'object' && 'file_path' in tool.input && (
                <span className="text-xs text-gray-400 truncate">
                  {String(tool.input.file_path)}
                </span>
              )}
              {tool.name === 'Read' && tool.input && typeof tool.input === 'object' && 'file_path' in tool.input && (
                <span className="text-xs text-gray-400 truncate">
                  {String(tool.input.file_path)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {duration && (
              <span className="text-xs text-gray-500">{duration}</span>
            )}
            {isComplete ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            )}
            <span className="text-xs text-gray-500">
              {event.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </button>

        {/* Expanded tool details */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="ml-6 p-3 bg-gray-800/50 border border-gray-700/50 rounded-lg"
            >
              {tool.input && (
                <div className="mb-2">
                  <div className="text-xs font-semibold text-gray-400 mb-1">Input:</div>
                  <pre className="text-xs text-gray-300 overflow-x-auto">
                    {typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input, null, 2)}
                  </pre>
                </div>
              )}
              {tool.output && (
                <div>
                  <div className="text-xs font-semibold text-gray-400 mb-1">Output:</div>
                  <pre className="text-xs text-gray-300 overflow-x-auto max-h-40">
                    {typeof tool.output === 'string' ? tool.output : JSON.stringify(tool.output, null, 2)}
                  </pre>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  if (event.type === 'text' || event.type === 'reasoning') {
    const message = event.data as TextMessage;
    const isReasoning = event.type === 'reasoning';

    return (
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.02 }}
        className={`p-3 rounded-lg border ${
          isReasoning
            ? 'border-blue-500/30 bg-blue-950/20'
            : 'border-gray-700/30 bg-gray-800/20'
        }`}
      >
        <div className="flex items-start gap-2">
          {isReasoning && <Brain className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />}
          <div className="flex-1 text-sm text-gray-300 prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.text}
            </ReactMarkdown>
          </div>
          <span className="text-xs text-gray-500 flex-shrink-0">
            {event.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      </motion.div>
    );
  }

  return null;
}

export function ActivityFeed({ timeline, isActive, toolsByTodo, textByTodo }: ActivityFeedProps) {
  // Build timeline on-the-fly if not provided
  const effectiveTimeline = useMemo(() => {
    if (timeline && timeline.length > 0) {
      return timeline;
    }

    // Build from toolsByTodo and textByTodo if available
    const events: TimelineEvent[] = [];

    if (toolsByTodo) {
      Object.entries(toolsByTodo).forEach(([todoIndexStr, tools]) => {
        tools.forEach(tool => {
          events.push({
            id: tool.id,
            timestamp: tool.startTime,
            type: 'tool',
            todoIndex: parseInt(todoIndexStr),
            data: tool,
          });
        });
      });
    }

    if (textByTodo) {
      Object.entries(textByTodo).forEach(([todoIndexStr, texts]) => {
        texts.forEach(text => {
          events.push({
            id: text.id,
            timestamp: text.timestamp,
            type: 'text',
            todoIndex: parseInt(todoIndexStr),
            data: text,
          });
        });
      });
    }

    // Sort chronologically
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return events;
  }, [timeline, toolsByTodo, textByTodo]);

  if (!effectiveTimeline || effectiveTimeline.length === 0) {
    return (
      <div className="p-6 text-center">
        <div className="flex items-center justify-center gap-2 text-gray-400">
          {isActive ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Waiting for activity...</span>
            </>
          ) : (
            <span className="text-sm">No activity yet</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      <AnimatePresence mode="popLayout">
        {effectiveTimeline.map((event, index) => (
          <ActivityFeedItem key={event.id} event={event} index={index} />
        ))}
      </AnimatePresence>
    </div>
  );
}
