"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generationNotes = exports.generationToolCalls = exports.generationTodos = exports.generationSessions = exports.portAllocations = exports.messages = exports.projects = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
exports.projects = (0, pg_core_1.pgTable)('projects', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    name: (0, pg_core_1.text)('name').notNull(),
    slug: (0, pg_core_1.text)('slug').notNull().unique(),
    description: (0, pg_core_1.text)('description'),
    originalPrompt: (0, pg_core_1.text)('original_prompt'),
    icon: (0, pg_core_1.text)('icon').default('Folder'),
    status: (0, pg_core_1.text)('status').notNull().default('pending'),
    projectType: (0, pg_core_1.text)('project_type'),
    path: (0, pg_core_1.text)('path'), // Nullable - deprecated, path should be calculated from slug
    runCommand: (0, pg_core_1.text)('run_command'),
    port: (0, pg_core_1.integer)('port'),
    devServerPid: (0, pg_core_1.integer)('dev_server_pid'),
    devServerPort: (0, pg_core_1.integer)('dev_server_port'),
    devServerStatus: (0, pg_core_1.text)('dev_server_status').default('stopped'),
    tunnelUrl: (0, pg_core_1.text)('tunnel_url'),
    generationState: (0, pg_core_1.text)('generation_state'),
    lastActivityAt: (0, pg_core_1.timestamp)('last_activity_at').defaultNow(),
    errorMessage: (0, pg_core_1.text)('error_message'),
    createdAt: (0, pg_core_1.timestamp)('created_at').notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').notNull().defaultNow(),
});
exports.messages = (0, pg_core_1.pgTable)('messages', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    projectId: (0, pg_core_1.uuid)('project_id')
        .notNull()
        .references(() => exports.projects.id, { onDelete: 'cascade' }),
    role: (0, pg_core_1.text)('role').notNull(),
    content: (0, pg_core_1.text)('content').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').notNull().defaultNow(),
});
exports.portAllocations = (0, pg_core_1.pgTable)('port_allocations', {
    port: (0, pg_core_1.integer)('port').primaryKey(),
    framework: (0, pg_core_1.text)('framework').notNull(),
    projectId: (0, pg_core_1.uuid)('project_id').references(() => exports.projects.id, { onDelete: 'set null' }),
    reservedAt: (0, pg_core_1.timestamp)('reserved_at').defaultNow(),
});
exports.generationSessions = (0, pg_core_1.pgTable)('generation_sessions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    projectId: (0, pg_core_1.uuid)('project_id').notNull().references(() => exports.projects.id, { onDelete: 'cascade' }),
    buildId: (0, pg_core_1.text)('build_id').notNull(),
    operationType: (0, pg_core_1.text)('operation_type'),
    status: (0, pg_core_1.text)('status').notNull().default('active'),
    startedAt: (0, pg_core_1.timestamp)('started_at').notNull().defaultNow(),
    endedAt: (0, pg_core_1.timestamp)('ended_at'),
    summary: (0, pg_core_1.text)('summary'),
    rawState: (0, pg_core_1.jsonb)('raw_state'),
    createdAt: (0, pg_core_1.timestamp)('created_at').notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').notNull().defaultNow(),
}, (table) => ({
    projectIdIdx: (0, pg_core_1.index)('generation_sessions_project_id_idx').on(table.projectId),
    buildIdUnique: (0, pg_core_1.uniqueIndex)('generation_sessions_build_id_unique').on(table.buildId),
}));
exports.generationTodos = (0, pg_core_1.pgTable)('generation_todos', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    sessionId: (0, pg_core_1.uuid)('session_id').notNull().references(() => exports.generationSessions.id, { onDelete: 'cascade' }),
    todoIndex: (0, pg_core_1.integer)('todo_index').notNull(),
    content: (0, pg_core_1.text)('content').notNull(),
    activeForm: (0, pg_core_1.text)('active_form'),
    status: (0, pg_core_1.text)('status').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').notNull().defaultNow(),
}, (table) => ({
    sessionIdIdx: (0, pg_core_1.index)('generation_todos_session_id_idx').on(table.sessionId),
    sessionIndexUnique: (0, pg_core_1.uniqueIndex)('generation_todos_session_index_unique').on(table.sessionId, table.todoIndex),
}));
exports.generationToolCalls = (0, pg_core_1.pgTable)('generation_tool_calls', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    sessionId: (0, pg_core_1.uuid)('session_id').notNull().references(() => exports.generationSessions.id, { onDelete: 'cascade' }),
    todoIndex: (0, pg_core_1.integer)('todo_index').notNull(),
    toolCallId: (0, pg_core_1.text)('tool_call_id').notNull(),
    name: (0, pg_core_1.text)('name').notNull(),
    input: (0, pg_core_1.jsonb)('input'),
    output: (0, pg_core_1.jsonb)('output'),
    state: (0, pg_core_1.text)('state').notNull(),
    startedAt: (0, pg_core_1.timestamp)('started_at').notNull().defaultNow(),
    endedAt: (0, pg_core_1.timestamp)('ended_at'),
    createdAt: (0, pg_core_1.timestamp)('created_at').notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').notNull().defaultNow(),
}, (table) => ({
    sessionIdIdx: (0, pg_core_1.index)('generation_tool_calls_session_id_idx').on(table.sessionId),
    toolCallUnique: (0, pg_core_1.uniqueIndex)('generation_tool_calls_call_id_unique')
        .on(table.sessionId, table.toolCallId),
}));
exports.generationNotes = (0, pg_core_1.pgTable)('generation_notes', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    sessionId: (0, pg_core_1.uuid)('session_id').notNull().references(() => exports.generationSessions.id, { onDelete: 'cascade' }),
    todoIndex: (0, pg_core_1.integer)('todo_index').notNull(),
    textId: (0, pg_core_1.text)('text_id'),
    kind: (0, pg_core_1.text)('kind').notNull().default('text'),
    content: (0, pg_core_1.text)('content').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').notNull().defaultNow(),
}, (table) => ({
    sessionIdIdx: (0, pg_core_1.index)('generation_notes_session_id_idx').on(table.sessionId),
    textIdUnique: (0, pg_core_1.uniqueIndex)('generation_notes_text_id_unique')
        .on(table.sessionId, table.textId)
        .where((0, drizzle_orm_1.sql) `${table.textId} is not null`),
}));
