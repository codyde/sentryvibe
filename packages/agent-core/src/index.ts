export { CLAUDE_SYSTEM_PROMPT, CODEX_SYSTEM_PROMPT } from './lib/prompts';
export * from './shared/runner/messages';
export { DEFAULT_AGENT_ID, DEFAULT_CLAUDE_MODEL_ID, type AgentId, type ClaudeModelId } from './types/agent';
export type { ProjectSummary, ProjectStatus } from './types/project';
export type { 
  GitHubCommit, 
  GitHubMeta, 
  GitHubStatus, 
  UpdateGitHubSettingsRequest,
  GitHubSetupResult,
  GitHubPushResult,
  GitHubSyncResult,
  GitHubAuthStatus,
  GitHubChatMessageType
} from './types/github';
export { GITHUB_CHAT_MESSAGES } from './types/github';

// Only export specific items from agents to prevent bundling server-only code
export { resolveAgentStrategy } from './lib/agents';
export type { AgentStrategy, AgentStrategyContext } from './lib/agents';

// Template configuration (server-only)
export { setTemplatesPath } from './lib/templates/config.server';

// Unified logging system
export { buildLogger } from './lib/logging/build-logger';

// WebSocket server (server-only)
export { buildWebSocketServer } from './lib/websocket';

// Database utilities - import from '@sentryvibe/agent-core/lib/db/client' instead
// These are NOT exported from the main index to avoid bundling better-sqlite3/pg
// in packages that don't need database access (like the runner)
// 
// To use database in your code:
//   import { db, initializeDatabase, isLocalMode } from '@sentryvibe/agent-core/lib/db/client';
//   import { runMigrations } from '@sentryvibe/agent-core/lib/db/migrate';

// Only export the mode detection utilities (no native dependencies)
export { isLocalMode, isHostedMode, getDatabaseMode } from './lib/db/mode';
export type { DatabaseMode } from './lib/db/mode';
