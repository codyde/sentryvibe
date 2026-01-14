import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// ============================================================================
// SQLite Schema for Local Mode
// ============================================================================
// This is a simplified schema without auth tables since local mode
// runs as a single-user application without authentication.
// ============================================================================

// Helper for generating UUIDs in SQLite
const generateUUID = () => randomUUID();

// Helper for current timestamp as integer (Unix epoch ms)
const currentTimestamp = () => new Date();

// ============================================================================
// Application Tables
// ============================================================================

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey().$defaultFn(generateUUID),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  originalPrompt: text('original_prompt'),
  icon: text('icon').default('Folder'),
  status: text('status').notNull().default('pending'),
  projectType: text('project_type'),
  detectedFramework: text('detected_framework'),
  path: text('path'),
  runCommand: text('run_command'),
  port: integer('port'),
  devServerPid: integer('dev_server_pid'),
  devServerPort: integer('dev_server_port'),
  devServerStatus: text('dev_server_status').default('stopped'),
  devServerStatusUpdatedAt: integer('dev_server_status_updated_at', { mode: 'timestamp' }).$defaultFn(currentTimestamp),
  tunnelUrl: text('tunnel_url'),
  runnerId: text('runner_id'),
  generationState: text('generation_state'),
  designPreferences: text('design_preferences', { mode: 'json' }),
  tags: text('tags', { mode: 'json' }),
  lastActivityAt: integer('last_activity_at', { mode: 'timestamp' }).$defaultFn(currentTimestamp),
  errorMessage: text('error_message'),
  // GitHub integration fields
  githubRepo: text('github_repo'),
  githubUrl: text('github_url'),
  githubBranch: text('github_branch'),
  githubLastPushedAt: integer('github_last_pushed_at', { mode: 'timestamp' }),
  githubAutoPush: integer('github_auto_push', { mode: 'boolean' }).default(false),
  githubLastSyncAt: integer('github_last_sync_at', { mode: 'timestamp' }),
  githubMeta: text('github_meta', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(currentTimestamp),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(currentTimestamp),
}, (table) => ({
  runnerIdIdx: index('projects_runner_id_idx').on(table.runnerId),
  statusIdx: index('projects_status_idx').on(table.status),
  lastActivityIdx: index('projects_last_activity_idx').on(table.lastActivityAt),
}));

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey().$defaultFn(generateUUID),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(currentTimestamp),
});

export const portAllocations = sqliteTable('port_allocations', {
  port: integer('port').primaryKey(),
  framework: text('framework').notNull(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  reservedAt: integer('reserved_at', { mode: 'timestamp' }).$defaultFn(currentTimestamp),
});

export const runningProcesses = sqliteTable('running_processes', {
  projectId: text('project_id').primaryKey().notNull().references(() => projects.id, { onDelete: 'cascade' }),
  pid: integer('pid').notNull(),
  port: integer('port'),
  command: text('command'),
  runnerId: text('runner_id'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull().$defaultFn(currentTimestamp),
  lastHealthCheck: integer('last_health_check', { mode: 'timestamp' }),
  healthCheckFailCount: integer('health_check_fail_count').notNull().default(0),
}, (table) => ({
  runnerIdIdx: index('running_processes_runner_id_idx').on(table.runnerId),
}));

export const generationSessions = sqliteTable('generation_sessions', {
  id: text('id').primaryKey().$defaultFn(generateUUID),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  buildId: text('build_id').notNull(),
  operationType: text('operation_type'),
  status: text('status').notNull().default('active'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull().$defaultFn(currentTimestamp),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  summary: text('summary'),
  rawState: text('raw_state', { mode: 'json' }),
  isAutoFix: integer('is_auto_fix', { mode: 'boolean' }).default(false),
  autoFixError: text('auto_fix_error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(currentTimestamp),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(currentTimestamp),
}, (table) => ({
  projectIdIdx: index('generation_sessions_project_id_idx').on(table.projectId),
  buildIdUnique: uniqueIndex('generation_sessions_build_id_unique').on(table.buildId),
}));

export const generationTodos = sqliteTable('generation_todos', {
  id: text('id').primaryKey().$defaultFn(generateUUID),
  sessionId: text('session_id').notNull().references(() => generationSessions.id, { onDelete: 'cascade' }),
  todoIndex: integer('todo_index').notNull(),
  content: text('content').notNull(),
  activeForm: text('active_form'),
  status: text('status').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(currentTimestamp),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(currentTimestamp),
}, (table) => ({
  sessionIdIdx: index('generation_todos_session_id_idx').on(table.sessionId),
  sessionIndexUnique: uniqueIndex('generation_todos_session_index_unique').on(table.sessionId, table.todoIndex),
}));

export const generationToolCalls = sqliteTable('generation_tool_calls', {
  id: text('id').primaryKey().$defaultFn(generateUUID),
  sessionId: text('session_id').notNull().references(() => generationSessions.id, { onDelete: 'cascade' }),
  todoIndex: integer('todo_index').notNull(),
  toolCallId: text('tool_call_id').notNull(),
  name: text('name').notNull(),
  input: text('input', { mode: 'json' }),
  output: text('output', { mode: 'json' }),
  state: text('state').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull().$defaultFn(currentTimestamp),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(currentTimestamp),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(currentTimestamp),
}, (table) => ({
  sessionIdIdx: index('generation_tool_calls_session_id_idx').on(table.sessionId),
  toolCallUnique: uniqueIndex('generation_tool_calls_call_id_unique')
    .on(table.sessionId, table.toolCallId),
}));

export const generationNotes = sqliteTable('generation_notes', {
  id: text('id').primaryKey().$defaultFn(generateUUID),
  sessionId: text('session_id').notNull().references(() => generationSessions.id, { onDelete: 'cascade' }),
  todoIndex: integer('todo_index').notNull(),
  textId: text('text_id'),
  kind: text('kind').notNull().default('text'),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(currentTimestamp),
}, (table) => ({
  sessionIdIdx: index('generation_notes_session_id_idx').on(table.sessionId),
  // SQLite doesn't support partial indexes with WHERE clause in the same way
  // We'll handle uniqueness in application logic for textId
}));

export const serverOperations = sqliteTable('server_operations', {
  id: text('id').primaryKey().$defaultFn(generateUUID),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  operation: text('operation').notNull(),
  status: text('status').notNull().default('pending'),
  runnerId: text('runner_id'),
  port: integer('port'),
  pid: integer('pid'),
  error: text('error'),
  failureReason: text('failure_reason'),
  retryCount: integer('retry_count').notNull().default(0),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(currentTimestamp),
  sentAt: integer('sent_at', { mode: 'timestamp' }),
  ackAt: integer('ack_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
}, (table) => ({
  projectIdIdx: index('server_operations_project_id_idx').on(table.projectId),
  statusIdx: index('server_operations_status_idx').on(table.status),
  createdAtIdx: index('server_operations_created_at_idx').on(table.createdAt),
}));

// ============================================================================
// Type Exports
// ============================================================================

// Application types
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type PortAllocation = typeof portAllocations.$inferSelect;
export type ServerOperation = typeof serverOperations.$inferSelect;
export type NewServerOperation = typeof serverOperations.$inferInsert;
export type GenerationSession = typeof generationSessions.$inferSelect;
export type GenerationTodo = typeof generationTodos.$inferSelect;
export type GenerationToolCall = typeof generationToolCalls.$inferSelect;
export type GenerationNote = typeof generationNotes.$inferSelect;

// Placeholder types for auth tables (not used in local mode, but needed for type compatibility)
// These are minimal stubs so code that references them can still compile
export type User = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  hasCompletedOnboarding: boolean;
  createdAt: Date;
  updatedAt: Date;
};
export type NewUser = Omit<User, 'id' | 'createdAt' | 'updatedAt'>;
export type Session = {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
};
export type NewSession = Omit<Session, 'id' | 'createdAt' | 'updatedAt'>;
export type Account = {
  id: string;
  userId: string;
  accountId: string;
  providerId: string;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  scope: string | null;
  idToken: string | null;
  password: string | null;
  createdAt: Date;
  updatedAt: Date;
};
export type NewAccount = Omit<Account, 'id' | 'createdAt' | 'updatedAt'>;
export type Verification = {
  id: string;
  identifier: string;
  value: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};
export type NewVerification = Omit<Verification, 'id' | 'createdAt' | 'updatedAt'>;
export type RunnerKey = {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
};
export type NewRunnerKey = Omit<RunnerKey, 'id' | 'createdAt'>;

// Dummy table exports for code that imports them (they won't be used in queries)
// These are needed for imports but will throw if actually queried
export const users = null as any;
export const sessions = null as any;
export const accounts = null as any;
export const verifications = null as any;
export const runnerKeys = null as any;
