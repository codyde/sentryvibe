import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  icon: text('icon').default('Folder'), // Lucide icon name
  status: text('status', { enum: ['pending', 'in_progress', 'completed', 'failed'] })
    .notNull()
    .default('pending'),
  projectType: text('project_type'), // 'next', 'vite-react', etc
  path: text('path').notNull(), // Filesystem path
  runCommand: text('run_command'), // 'npm run dev', etc
  port: integer('port'), // Dev server port
  devServerPid: integer('dev_server_pid'), // Process ID
  devServerPort: integer('dev_server_port'), // Actual running port
  devServerStatus: text('dev_server_status', {
    enum: ['stopped', 'starting', 'running', 'failed']
  }).default('stopped'),
  lastActivityAt: integer('last_activity_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date()),
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
    .notNull(),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content', { mode: 'json' }).notNull(), // Stores parts array as JSON
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
