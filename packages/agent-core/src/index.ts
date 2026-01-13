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

// Database utilities
export { 
  db, 
  getDb, 
  initializeDatabase,
  resetDatabase,
  type DatabaseClient
} from './lib/db/client';
export { runMigrations } from './lib/db/migrate';
