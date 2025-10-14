'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AgentId } from '@sentryvibe/agent-core/src/types/agent';
import { DEFAULT_AGENT_ID } from '@sentryvibe/agent-core/src/types/agent';

export interface AgentOption {
  id: AgentId;
  label: string;
  description: string;
}

interface AgentContextValue {
  selectedAgentId: AgentId;
  setSelectedAgentId: (id: AgentId) => void;
  agents: AgentOption[];
}

const AGENTS: AgentOption[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    description: 'Anthropic Sonnet 4.5 with Claude Code tools',
  },
  {
    id: 'openai-codex',
    label: 'OpenAI Codex',
    description: 'OpenAI Codex agent with sandbox support',
  },
];

const STORAGE_KEY = 'selectedAgentId';

const AgentContext = createContext<AgentContextValue | undefined>(undefined);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [selectedAgentId, setSelectedAgentIdState] = useState<AgentId>(DEFAULT_AGENT_ID);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'claude-code' || stored === 'openai-codex') {
      setSelectedAgentIdState(stored);
    }
  }, []);

  const setSelectedAgentId = useCallback((id: AgentId) => {
    setSelectedAgentIdState(id);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const value = useMemo<AgentContextValue>(
    () => ({
      selectedAgentId,
      setSelectedAgentId,
      agents: AGENTS,
    }),
    [selectedAgentId, setSelectedAgentId],
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgent() {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgent must be used within an AgentProvider');
  }
  return context;
}
