import type { AgentId } from '../../types/agent';
import { getAgentStrategy, registerAgentStrategy } from './strategy';
import claudeStrategy from './claude-strategy';
import codexStrategy from './codex-strategy';

let initialized = false;

function ensureRegistry() {
  if (initialized) {
    return;
  }
  registerAgentStrategy('claude-code', claudeStrategy);
  registerAgentStrategy('openai-codex', codexStrategy);
  initialized = true;
}

export function resolveAgentStrategy(agentId: AgentId) {
  ensureRegistry();
  return getAgentStrategy(agentId);
}

export * from './strategy';
