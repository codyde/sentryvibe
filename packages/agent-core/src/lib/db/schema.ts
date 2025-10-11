import { pgTable, text, integer, timestamp, uuid } from 'drizzle-orm/pg-core';

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

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type PortAllocation = typeof portAllocations.$inferSelect;
