'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle, Loader2, XCircle } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ToolCallCardProps {
  toolName: string;
  input?: unknown;
  output?: unknown;
  state?: 'input-streaming' | 'input-available' | 'output-available';
  isOpen?: boolean;
}

export default function ToolCallCard({ toolName, input, output, state, isOpen = false }: ToolCallCardProps) {
  const [open, setOpen] = useState(isOpen);

  // Extract command/path summary from input
  const getSummary = (): string => {
    if (!input) return '';

    const inputObj = input as any;

    // For Bash commands
    if (inputObj.command) {
      const cmd = inputObj.command as string;
      return cmd.length > 60 ? cmd.substring(0, 60) + '...' : cmd;
    }

    // For file operations
    if (inputObj.file_path) {
      return inputObj.file_path as string;
    }

    if (inputObj.path) {
      return inputObj.path as string;
    }

    return '';
  };

  // Get status icon and color using Sentry brand palette
  const getStatusDisplay = () => {
    switch (state) {
      case 'input-streaming':
        return {
          icon: Loader2,
          color: 'text-[#7553FF]', // Sentry Blurple
          bgColor: 'bg-[#7553FF]/10',
          borderColor: 'border-[#7553FF]/30',
          glowColor: 'shadow-[#7553FF]/20',
          text: 'Preparing'
        };
      case 'input-available':
        return {
          icon: Loader2,
          color: 'text-[#FFD00E]', // Sentry Yellow
          bgColor: 'bg-[#FFD00E]/10',
          borderColor: 'border-[#FFD00E]/40',
          glowColor: 'shadow-[#FFD00E]/30',
          text: 'Running',
          pulse: true
        };
      case 'output-available':
        return {
          icon: CheckCircle,
          color: 'text-[#92DD00]', // Sentry Green
          bgColor: 'bg-[#92DD00]/10',
          borderColor: 'border-[#92DD00]/40',
          glowColor: 'shadow-[#92DD00]/20',
          text: 'Complete'
        };
      default:
        return {
          icon: Loader2,
          color: 'text-gray-400',
          bgColor: 'bg-gray-500/10',
          borderColor: 'border-gray-500/30',
          glowColor: '',
          text: 'Pending'
        };
    }
  };

  const status = getStatusDisplay();
  const StatusIcon = status.icon;
  const summary = getSummary();

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={`mt-2 rounded-lg border transition-all ${status.bgColor} ${status.borderColor} ${status.glowColor ? `shadow-lg ${status.glowColor}` : ''}`}>
        {/* Header - Always Visible */}
        <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Tool Name Badge */}
            <div className={`flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-medium ${status.bgColor} ${status.borderColor} border backdrop-blur-sm`}>
              <StatusIcon className={`w-3.5 h-3.5 ${status.color} ${status.pulse ? 'animate-spin' : ''}`} />
              <span className={status.color}>{toolName}</span>
            </div>

            {/* Command Summary */}
            {summary && (
              <span className="text-sm text-gray-400 font-mono truncate flex-1 min-w-0">
                {summary}
              </span>
            )}

            {/* Status Text */}
            <span className={`text-xs ${status.color} whitespace-nowrap`}>
              {status.text}
            </span>
          </div>

          {/* Expand/Collapse Icon */}
          <div className="ml-3 flex-shrink-0">
            {open ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </div>
        </CollapsibleTrigger>

        {/* Content - Collapsible */}
        <CollapsibleContent>
          <div className="px-4 pb-3 space-y-3 border-t border-white/10 pt-3">
            {/* Input Section */}
            {input !== undefined && input !== null && (
              <div>
                <div className="text-xs font-mono text-gray-500 mb-1">Input:</div>
                <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap bg-black/30 rounded p-3 overflow-x-auto">
                  {typeof input === 'string' ? input : JSON.stringify(input, null, 2)}
                </pre>
              </div>
            )}

            {/* Output Section */}
            {output !== undefined && output !== null && (
              <div>
                <div className="text-xs font-mono text-gray-500 mb-1">Output:</div>
                <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap bg-black/30 rounded p-3 max-h-60 overflow-auto">
                  {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
                </pre>
              </div>
            )}

            {/* No content yet */}
            {!input && !output && (
              <div className="text-xs text-gray-500 italic">
                Waiting for tool execution...
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
