'use client';

import { ChevronsUpDown, SlidersHorizontal, Sparkles } from 'lucide-react';
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
  const {
    selectedAgentId,
    setSelectedAgentId,
    agents,
    selectedClaudeModelId,
    setSelectedClaudeModelId,
    claudeModels,
  } = useAgent();
  const activeAgent = agents.find((agent) => agent.id === selectedAgentId);

  return (
    <div className={cn('flex w-full flex-col gap-2 sm:flex-row sm:items-stretch', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-left text-sm text-gray-300 transition hover:border-theme-primary/40 hover:bg-theme-primary-muted hover:text-white focus:outline-none"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-theme-primary" />
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
                  className="gap-3 rounded-md px-3 py-2 text-sm text-gray-200 hover:bg-theme-primary-muted hover:text-white data-[state=checked]:bg-theme-primary/30 pl-3 [&>span]:hidden"
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

      {selectedAgentId === 'claude-code' && (
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center justify-between gap-2 rounded-lg border border-theme-primary/40 bg-theme-primary-muted px-3 py-2 text-left text-sm text-theme-primary transition hover:border-theme-primary/60 hover:bg-theme-primary/20 hover:text-white focus:outline-none">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-theme-primary" />
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-wide text-theme-primary/80">
                  Claude Model
                </span>
                <span className="text-sm font-medium text-white">
                  {claudeModels.find((model) => model.id === selectedClaudeModelId)?.label ?? 'Select Model'}
                </span>
              </div>
            </div>
            <ChevronsUpDown className="h-4 w-4 text-theme-primary" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64 bg-gray-950/95 backdrop-blur">
            <DropdownMenuLabel className="text-xs uppercase tracking-wide text-gray-400">
              Claude Models
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuRadioGroup
              value={selectedClaudeModelId}
              onValueChange={(value) => {
                if (value === 'claude-haiku-4-5' || value === 'claude-sonnet-4-5' || value === 'claude-opus-4-5') {
                  setSelectedClaudeModelId(value);
                }
              }}
            >
              {claudeModels.map((model) => (
                <DropdownMenuRadioItem
                  key={model.id}
                  value={model.id}
                className="gap-3 rounded-md px-3 py-2 text-sm text-gray-200 hover:bg-theme-primary-muted hover:text-white data-[state=checked]:bg-theme-primary/30 pl-3 [&>span]:hidden"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{model.label}</span>
                    <span className="text-xs text-gray-400">{model.description}</span>
                  </div>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
