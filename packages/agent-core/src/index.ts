export { CLAUDE_SYSTEM_PROMPT, CODEX_SYSTEM_PROMPT } from './lib/prompts';
export * from './shared/runner/messages';
export { DEFAULT_AGENT_ID, type AgentId } from './types/agent';
export type { ProjectSummary, ProjectStatus } from './types/project';

// Only export specific items from agents to prevent bundling server-only code
export { resolveAgentStrategy } from './lib/agents';
export type { AgentStrategy, AgentStrategyContext } from './lib/agents';

// Template configuration (server-only)
export { setTemplatesPath } from './lib/templates/config.server';
