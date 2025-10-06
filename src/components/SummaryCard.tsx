'use client';

import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, FileText, Play, Square } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface SummaryCardProps {
  content: string;
  onViewFiles?: () => void;
  onStartServer?: () => void;
  onStopServer?: () => void;
  serverRunning?: boolean;
  serverStarting?: boolean;
}

export default function SummaryCard({ content, onViewFiles, onStartServer, onStopServer, serverRunning, serverStarting }: SummaryCardProps) {
  const [sectionsOpen, setSectionsOpen] = useState<Record<string, boolean>>({
    highlights: false,
    sections: false,
    tech: false,
    build: true, // Build status expanded by default
  });

  // Parse sections from markdown
  const sections = content.split(/###\s+/);

  return (
    <div className="mt-4 rounded-lg border-2 border-[#92DD00]/40 bg-gradient-to-br from-[#92DD00]/10 to-[#C0ED49]/5 shadow-xl shadow-[#92DD00]/20 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#92DD00]/20 to-[#C0ED49]/10 border-b border-[#92DD00]/30 px-6 py-4">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-[#92DD00]" />
          <h3 className="text-xl font-bold text-[#92DD00]">Generation Complete!</h3>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-4">
        {/* Main summary */}
        <div className="prose prose-invert max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => <h1 className="text-xl font-bold text-[#FFD00E] mb-4 mt-6 first:mt-0">{children}</h1>,
              h2: ({ children }) => <h2 className="text-lg font-semibold text-[#FF45A8] mb-3 mt-5 first:mt-0">{children}</h2>,
              h3: ({ children }) => <h3 className="text-base font-medium text-[#7553FF] mb-3 mt-4 first:mt-0">{children}</h3>,
              p: ({ children }) => <p className="mb-4 text-gray-300 last:mb-0 leading-relaxed">{children}</p>,
              ul: ({ children }) => <ul className="list-none space-y-2 mb-5">{children}</ul>,
              ol: ({ children }) => <ol className="list-none space-y-2 mb-5">{children}</ol>,
              li: ({ children }) => (
                <li className="flex items-start gap-2">
                  <span className="text-[#92DD00] mt-1">•</span>
                  <span className="flex-1 text-gray-300">{children}</span>
                </li>
              ),
              strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
              code: ({ children }) => (
                <code className="bg-[#181225] text-[#FF45A8] px-2 py-0.5 rounded text-sm font-mono border border-[#FF45A8]/30">
                  {children}
                </code>
              ),
              pre: ({ children }) => (
                <pre className="mb-6 mt-4">
                  {children}
                </pre>
              ),
              hr: ({ children }) => (
                <hr className="my-6 border-t border-[#92DD00]/20" />
              ),
            }}
          >
            {sections[0]}
          </ReactMarkdown>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-4 border-t border-[#92DD00]/20">
          {onViewFiles && (
            <button
              onClick={onViewFiles}
              className="flex items-center gap-2 px-4 py-2 bg-[#7553FF]/20 hover:bg-[#7553FF]/30 text-[#7553FF] border border-[#7553FF]/40 rounded-lg transition-colors font-medium"
            >
              <FileText className="w-4 h-4" />
              View Files
            </button>
          )}
          {serverRunning ? (
            <button
              onClick={onStopServer}
              className="flex items-center gap-2 px-4 py-2 bg-[#FF45A8]/20 hover:bg-[#FF45A8]/30 text-[#FF45A8] border border-[#FF45A8]/30 rounded-lg transition-colors font-medium"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
          ) : onStartServer ? (
            <button
              onClick={onStartServer}
              disabled={serverStarting}
              className="flex items-center gap-2 px-4 py-2 bg-[#92DD00]/20 hover:bg-[#92DD00]/30 text-[#92DD00] border border-[#92DD00]/40 rounded-lg transition-colors font-medium shadow-lg shadow-[#92DD00]/20 disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              {serverStarting ? 'Starting...' : 'Start Server'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
