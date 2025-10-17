/**
 * CLIENT-SAFE exports
 * This entry point contains ONLY types and constants that can be safely
 * imported in client-side code without pulling in server-only dependencies
 */

export { DEFAULT_AGENT_ID, type AgentId } from './types/agent';
export type { ProjectSummary, ProjectStatus } from './types/project';
export type { CodexSessionState } from './types/generation';

// Re-export message types (no server dependencies)
export * from './shared/runner/messages';
