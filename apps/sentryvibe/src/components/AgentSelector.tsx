'use client';

import { ChevronsUpDown, Sparkles } from 'lucide-react';
import { useAgent } from '@/contexts/AgentContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@sentryvibe/agent-core/lib/utils';

interface AgentSelectorProps {
  className?: string;
}

export default function AgentSelector({ className }: AgentSelectorProps = {}) {
  const { selectedAgentId, setSelectedAgentId, agents } = useAgent();
  const activeAgent = agents.find((agent) => agent.id === selectedAgentId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-left text-sm text-gray-300 transition hover:border-purple-400/40 hover:bg-purple-500/10 hover:text-white focus:outline-none',
          className,
        )}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-300" />
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-wide text-gray-500">
              Coding Agent
            </span>
            <span className="text-sm font-medium text-white">
              {activeAgent?.label ?? 'Select Agent'}
            </span>
          </div>
        </div>
        <ChevronsUpDown className="h-4 w-4 text-gray-500" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 bg-gray-950/95 backdrop-blur">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-gray-400">
          Choose Agent
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuRadioGroup
          value={selectedAgentId}
          onValueChange={(value) => {
            if (value === 'claude-code' || value === 'openai-codex') {
              setSelectedAgentId(value);
            }
          }}
        >
          {agents.map((agent) => (
            <DropdownMenuRadioItem
              key={agent.id}
              value={agent.id}
              className="gap-3 rounded-md px-3 py-2 text-sm text-gray-200 hover:bg-purple-500/20 hover:text-white data-[state=checked]:bg-purple-500/30"
            >
              <div className="flex flex-col">
                <span className="font-medium">{agent.label}</span>
                <span className="text-xs text-gray-400">{agent.description}</span>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
