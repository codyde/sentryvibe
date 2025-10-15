// Agent-related type definitions

/**
 * Identifier for different AI agents/models
 */
export type AgentId = string;

/**
 * Default agent to use when none is specified
 */
export const DEFAULT_AGENT_ID: AgentId = 'claude-3.5-sonnet';

/**
 * Available agent configurations
 */
export interface AgentConfig {
  id: AgentId;
  name: string;
  description?: string;
  provider: 'anthropic' | 'openai' | 'custom';
  model: string;
}

/**
 * Predefined agents
 */
export const AVAILABLE_AGENTS: AgentConfig[] = [
  {
    id: 'claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    description: 'Fast and capable for most tasks',
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
  },
  {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    description: 'Most capable model for complex tasks',
    provider: 'anthropic',
    model: 'claude-3-opus-20240229',
  },
];