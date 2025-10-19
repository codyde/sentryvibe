'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface ChatUpdateProps {
  content: string;
  defaultCollapsed?: boolean;
}

export default function ChatUpdate({ content, defaultCollapsed = true }: ChatUpdateProps) {
  const [isExpanded, setIsExpanded] = useState(!defaultCollapsed);

  // Extract preview text (first 80 chars, without markdown formatting)
  const previewText = content
    .replace(/\*\*/g, '') // Remove bold
    .replace(/\*/g, '') // Remove italic
    .replace(/#+ /g, '') // Remove headers
    .replace(/\n/g, ' ') // Replace newlines with spaces
    .trim()
    .substring(0, 80);

  const needsEllipsis = content.length > 80;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-3 rounded-lg border border-purple-500/20 bg-gradient-to-br from-purple-950/20 via-gray-900/40 to-gray-900/40 backdrop-blur-sm overflow-hidden"
    >
      {/* Header - Always visible, clickable */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-purple-500/5 transition-colors"
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="flex-shrink-0 w-6 h-6 rounded-md bg-purple-500/20 flex items-center justify-center">
            <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-xs font-medium text-gray-400 mb-0.5">Chat Update</p>
            {!isExpanded && (
              <p className="text-sm text-gray-300 truncate">
                {previewText}
                {needsEllipsis && '...'}
              </p>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 ml-2">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Content - Expandable */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-1 border-t border-purple-500/10">
              <div className="prose prose-sm prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    p: ({ children }) => <p className="text-gray-300 leading-relaxed mb-2 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                    em: ({ children }) => <em className="text-purple-300">{children}</em>,
                    ul: ({ children }) => <ul className="list-disc list-inside space-y-1 text-gray-300">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 text-gray-300">{children}</ol>,
                    li: ({ children }) => <li className="text-sm">{children}</li>,
                    code: ({ children }) => <code className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono text-xs">{children}</code>,
                    h1: ({ children }) => <h1 className="text-lg font-bold text-white mt-3 mb-2">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-base font-bold text-white mt-2 mb-1.5">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-200 mt-2 mb-1">{children}</h3>,
                  }}
                >
                  {content}
                </ReactMarkdown>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
