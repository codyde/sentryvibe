import { pgTable, text, integer, timestamp, uuid, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  originalPrompt: text('original_prompt'),
  icon: text('icon').default('Folder'),
  status: text('status').notNull().default('pending'),
  projectType: text('project_type'),
  path: text('path'), // Nullable - deprecated, path should be calculated from slug
  runCommand: text('run_command'),
  port: integer('port'),
  devServerPid: integer('dev_server_pid'),
  devServerPort: integer('dev_server_port'),
  devServerStatus: text('dev_server_status').default('stopped'),
  tunnelUrl: text('tunnel_url'),
  runnerId: text('runner_id'), // Runner that created/manages this project
  generationState: text('generation_state'),
  lastActivityAt: timestamp('last_activity_at').defaultNow(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const portAllocations = pgTable('port_allocations', {
  port: integer('port').primaryKey(),
  framework: text('framework').notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  reservedAt: timestamp('reserved_at').defaultNow(),
});

export const runningProcesses = pgTable('running_processes', {
  projectId: uuid('project_id').primaryKey().notNull().references(() => projects.id, { onDelete: 'cascade' }),
  pid: integer('pid').notNull(),
  port: integer('port'),
  command: text('command'),
  runnerId: text('runner_id'), // Runner that manages this process
  startedAt: timestamp('started_at').notNull().defaultNow(),
  lastHealthCheck: timestamp('last_health_check'),
  healthCheckFailCount: integer('health_check_fail_count').notNull().default(0),
});

export const generationSessions = pgTable('generation_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  buildId: text('build_id').notNull(),
  operationType: text('operation_type'),
  status: text('status').notNull().default('active'),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  endedAt: timestamp('ended_at'),
  summary: text('summary'),
  rawState: jsonb('raw_state'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  projectIdIdx: index('generation_sessions_project_id_idx').on(table.projectId),
  buildIdUnique: uniqueIndex('generation_sessions_build_id_unique').on(table.buildId),
}));

export const generationTodos = pgTable('generation_todos', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => generationSessions.id, { onDelete: 'cascade' }),
  todoIndex: integer('todo_index').notNull(),
  content: text('content').notNull(),
  activeForm: text('active_form'),
  status: text('status').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  sessionIdIdx: index('generation_todos_session_id_idx').on(table.sessionId),
  sessionIndexUnique: uniqueIndex('generation_todos_session_index_unique').on(table.sessionId, table.todoIndex),
}));

export const generationToolCalls = pgTable('generation_tool_calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => generationSessions.id, { onDelete: 'cascade' }),
  todoIndex: integer('todo_index').notNull(),
  toolCallId: text('tool_call_id').notNull(),
  name: text('name').notNull(),
  input: jsonb('input'),
  output: jsonb('output'),
  state: text('state').notNull(),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  endedAt: timestamp('ended_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  sessionIdIdx: index('generation_tool_calls_session_id_idx').on(table.sessionId),
  toolCallUnique: uniqueIndex('generation_tool_calls_call_id_unique')
    .on(table.sessionId, table.toolCallId),
}));

export const generationNotes = pgTable('generation_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => generationSessions.id, { onDelete: 'cascade' }),
  todoIndex: integer('todo_index').notNull(),
  textId: text('text_id'),
  kind: text('kind').notNull().default('text'),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  sessionIdIdx: index('generation_notes_session_id_idx').on(table.sessionId),
  textIdUnique: uniqueIndex('generation_notes_text_id_unique')
    .on(table.sessionId, table.textId)
    .where(sql`${table.textId} is not null`),
}));

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type PortAllocation = typeof portAllocations.$inferSelect;
export type GenerationSession = typeof generationSessions.$inferSelect;
export type GenerationTodo = typeof generationTodos.$inferSelect;
export type GenerationToolCall = typeof generationToolCalls.$inferSelect;
export type GenerationNote = typeof generationNotes.$inferSelect;
