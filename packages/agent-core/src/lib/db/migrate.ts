import { getDatabaseMode, getPgliteDataDir } from './client.js';
import { existsSync, mkdirSync } from 'fs';

/**
 * Run migrations for PostgreSQL using drizzle-kit
 */
async function runPostgresMigrations(migrationsFolder: string = './drizzle') {
  // Use require for dynamic imports to avoid TypeScript issues with the module structure
  const { drizzle } = require('drizzle-orm/node-postgres');
  const { migrate } = require('drizzle-orm/node-postgres/migrator');
  const { Pool } = require('pg');

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not set.');
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.PGSSLMODE === 'disable'
      ? false
      : { rejectUnauthorized: false },
  });
  const db = drizzle(pool);

  console.log('🔄 Running PostgreSQL database migrations...');

  try {
    await migrate(db, { migrationsFolder });
    console.log('✅ Migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * Initialize PGlite database with schema (push mode, no migration files needed)
 * This creates the schema directly using the Drizzle schema definitions
 */
export async function initializePgliteSchema() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = require('drizzle-orm/pglite');
  const { sql } = require('drizzle-orm');
  const schemaModule = require('./schema');

  const dataDir = getPgliteDataDir();

  // Ensure the data directory exists
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  console.log(`🔄 Initializing PGlite database at ${dataDir}...`);

  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema: schemaModule });

  try {
    // Check if tables already exist
    const result = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'projects'
    `);

    if (result.rows.length > 0) {
      console.log('✅ Database already initialized');
      await client.close();
      return;
    }

    // Create the pgcrypto extension for UUID support
    // Note: PGlite has built-in support for gen_random_uuid()
    try {
      await db.execute(sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    } catch {
      // PGlite might not need the extension, continue anyway
    }

    // Create projects table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "projects" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" text NOT NULL,
        "slug" text NOT NULL UNIQUE,
        "description" text,
        "original_prompt" text,
        "icon" text DEFAULT 'Folder',
        "status" text NOT NULL DEFAULT 'pending',
        "project_type" text,
        "detected_framework" text,
        "path" text,
        "run_command" text,
        "port" integer,
        "dev_server_pid" integer,
        "dev_server_port" integer,
        "dev_server_status" text DEFAULT 'stopped',
        "dev_server_status_updated_at" timestamp DEFAULT now(),
        "tunnel_url" text,
        "runner_id" text,
        "generation_state" text,
        "design_preferences" jsonb,
        "tags" jsonb,
        "last_activity_at" timestamp DEFAULT now(),
        "error_message" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);

    // Create messages table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "messages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "role" text NOT NULL,
        "content" text NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now()
      )
    `);

    // Create port_allocations table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "port_allocations" (
        "port" integer PRIMARY KEY NOT NULL,
        "framework" text NOT NULL,
        "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
        "reserved_at" timestamp DEFAULT now()
      )
    `);

    // Create running_processes table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "running_processes" (
        "project_id" uuid PRIMARY KEY NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "pid" integer NOT NULL,
        "port" integer,
        "command" text,
        "runner_id" text,
        "started_at" timestamp NOT NULL DEFAULT now(),
        "last_health_check" timestamp,
        "health_check_fail_count" integer NOT NULL DEFAULT 0
      )
    `);

    // Create generation_sessions table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "generation_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "build_id" text NOT NULL,
        "operation_type" text,
        "status" text NOT NULL DEFAULT 'active',
        "started_at" timestamp NOT NULL DEFAULT now(),
        "ended_at" timestamp,
        "summary" text,
        "raw_state" jsonb,
        "is_auto_fix" boolean DEFAULT false,
        "auto_fix_error" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);

    // Create generation_todos table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "generation_todos" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "session_id" uuid NOT NULL REFERENCES "generation_sessions"("id") ON DELETE CASCADE,
        "todo_index" integer NOT NULL,
        "content" text NOT NULL,
        "active_form" text,
        "status" text NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);

    // Create generation_tool_calls table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "generation_tool_calls" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "session_id" uuid NOT NULL REFERENCES "generation_sessions"("id") ON DELETE CASCADE,
        "todo_index" integer NOT NULL,
        "tool_call_id" text NOT NULL,
        "name" text NOT NULL,
        "input" jsonb,
        "output" jsonb,
        "state" text NOT NULL,
        "started_at" timestamp NOT NULL DEFAULT now(),
        "ended_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);

    // Create generation_notes table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "generation_notes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "session_id" uuid NOT NULL REFERENCES "generation_sessions"("id") ON DELETE CASCADE,
        "todo_index" integer NOT NULL,
        "text_id" text,
        "kind" text NOT NULL DEFAULT 'text',
        "content" text NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now()
      )
    `);

    // Create server_operations table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "server_operations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "operation" text NOT NULL,
        "status" text NOT NULL DEFAULT 'pending',
        "runner_id" text,
        "port" integer,
        "pid" integer,
        "error" text,
        "failure_reason" text,
        "retry_count" integer NOT NULL DEFAULT 0,
        "metadata" jsonb,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "sent_at" timestamp,
        "ack_at" timestamp,
        "completed_at" timestamp
      )
    `);

    // Create indexes
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "projects_runner_id_idx" ON "projects" ("runner_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "projects_status_idx" ON "projects" ("status")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "projects_last_activity_idx" ON "projects" ("last_activity_at")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "running_processes_runner_id_idx" ON "running_processes" ("runner_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "generation_sessions_project_id_idx" ON "generation_sessions" ("project_id")`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "generation_sessions_build_id_unique" ON "generation_sessions" ("build_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "generation_todos_session_id_idx" ON "generation_todos" ("session_id")`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "generation_todos_session_index_unique" ON "generation_todos" ("session_id", "todo_index")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "generation_tool_calls_session_id_idx" ON "generation_tool_calls" ("session_id")`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "generation_tool_calls_call_id_unique" ON "generation_tool_calls" ("session_id", "tool_call_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "generation_notes_session_id_idx" ON "generation_notes" ("session_id")`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "generation_notes_text_id_unique" ON "generation_notes" ("session_id", "text_id") WHERE "text_id" IS NOT NULL`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "server_operations_project_id_idx" ON "server_operations" ("project_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "server_operations_status_idx" ON "server_operations" ("status")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "server_operations_created_at_idx" ON "server_operations" ("created_at")`);

    console.log('✅ Database schema initialized successfully');
  } catch (error) {
    console.error('❌ Schema initialization failed:', error);
    throw error;
  } finally {
    await client.close();
  }
}

/**
 * Run migrations based on the current database mode
 */
export async function runMigrations(migrationsFolder: string = './drizzle') {
  const mode = getDatabaseMode();

  if (mode === 'pglite') {
    // For PGlite in local mode, we use direct schema initialization
    // This avoids the need for migration files
    await initializePgliteSchema();
  } else {
    await runPostgresMigrations(migrationsFolder);
  }
}

// Run migrations if this file is executed directly
if (typeof require !== 'undefined' && require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
