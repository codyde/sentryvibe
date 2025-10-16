/**
 * SERVER-ONLY exports
 * This entry point includes full functionality with server-only dependencies
 * Never import this in client-side code
 */

import 'server-only';

// Re-export everything from client (types/constants)
export * from './client';

// Server-only functionality
export { CLAUDE_SYSTEM_PROMPT, CODEX_SYSTEM_PROMPT } from './lib/prompts';
export { resolveAgentStrategy } from './lib/agents';
export type { AgentStrategy, AgentStrategyContext } from './lib/agents';

// Template configuration
export { setTemplatesPath } from './lib/templates/config.server';
