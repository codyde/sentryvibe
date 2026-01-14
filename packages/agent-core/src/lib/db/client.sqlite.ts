import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import * as schema from './schema.sqlite.js';
import { getSqlitePath } from './mode.js';

// Database client type for SQLite
export type SqliteClient = BetterSQLite3Database<typeof schema>;

declare global {
  var __sqliteDb: SqliteClient | undefined;
  var __sqliteRaw: Database.Database | undefined;
}

/**
 * Ensure the directory for the SQLite database exists
 */
function ensureDbDirectory(dbPath: string): void {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`Created database directory: ${dir}`);
  }
}

/**
 * Create the SQLite database schema if tables don't exist
 */
function ensureSchema(sqlite: Database.Database): void {
  // Check if projects table exists (as a proxy for "schema exists")
  const tableExists = sqlite.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='projects'
  `).get();
  
  if (!tableExists) {
    console.log('Initializing SQLite database schema...');
    
    // Create all tables
    sqlite.exec(`
      -- Projects table
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT,
        original_prompt TEXT,
        icon TEXT DEFAULT 'Folder',
        status TEXT NOT NULL DEFAULT 'pending',
        project_type TEXT,
        detected_framework TEXT,
        path TEXT,
        run_command TEXT,
        port INTEGER,
        dev_server_pid INTEGER,
        dev_server_port INTEGER,
        dev_server_status TEXT DEFAULT 'stopped',
        dev_server_status_updated_at INTEGER,
        tunnel_url TEXT,
        runner_id TEXT,
        generation_state TEXT,
        design_preferences TEXT,
        tags TEXT,
        last_activity_at INTEGER,
        error_message TEXT,
        github_repo TEXT,
        github_url TEXT,
        github_branch TEXT,
        github_last_pushed_at INTEGER,
        github_auto_push INTEGER DEFAULT 0,
        github_last_sync_at INTEGER,
        github_meta TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS projects_runner_id_idx ON projects(runner_id);
      CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status);
      CREATE INDEX IF NOT EXISTS projects_last_activity_idx ON projects(last_activity_at);

      -- Messages table
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      -- Port allocations table
      CREATE TABLE IF NOT EXISTS port_allocations (
        port INTEGER PRIMARY KEY,
        framework TEXT NOT NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        reserved_at INTEGER
      );

      -- Running processes table
      CREATE TABLE IF NOT EXISTS running_processes (
        project_id TEXT PRIMARY KEY NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        pid INTEGER NOT NULL,
        port INTEGER,
        command TEXT,
        runner_id TEXT,
        started_at INTEGER NOT NULL,
        last_health_check INTEGER,
        health_check_fail_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS running_processes_runner_id_idx ON running_processes(runner_id);

      -- Generation sessions table
      CREATE TABLE IF NOT EXISTS generation_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        build_id TEXT NOT NULL,
        operation_type TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        summary TEXT,
        raw_state TEXT,
        is_auto_fix INTEGER DEFAULT 0,
        auto_fix_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS generation_sessions_project_id_idx ON generation_sessions(project_id);
      CREATE UNIQUE INDEX IF NOT EXISTS generation_sessions_build_id_unique ON generation_sessions(build_id);

      -- Generation todos table
      CREATE TABLE IF NOT EXISTS generation_todos (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES generation_sessions(id) ON DELETE CASCADE,
        todo_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        active_form TEXT,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS generation_todos_session_id_idx ON generation_todos(session_id);
      CREATE UNIQUE INDEX IF NOT EXISTS generation_todos_session_index_unique ON generation_todos(session_id, todo_index);

      -- Generation tool calls table
      CREATE TABLE IF NOT EXISTS generation_tool_calls (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES generation_sessions(id) ON DELETE CASCADE,
        todo_index INTEGER NOT NULL,
        tool_call_id TEXT NOT NULL,
        name TEXT NOT NULL,
        input TEXT,
        output TEXT,
        state TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS generation_tool_calls_session_id_idx ON generation_tool_calls(session_id);
      CREATE UNIQUE INDEX IF NOT EXISTS generation_tool_calls_call_id_unique ON generation_tool_calls(session_id, tool_call_id);

      -- Generation notes table
      CREATE TABLE IF NOT EXISTS generation_notes (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES generation_sessions(id) ON DELETE CASCADE,
        todo_index INTEGER NOT NULL,
        text_id TEXT,
        kind TEXT NOT NULL DEFAULT 'text',
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS generation_notes_session_id_idx ON generation_notes(session_id);

      -- Server operations table
      CREATE TABLE IF NOT EXISTS server_operations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        operation TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        runner_id TEXT,
        port INTEGER,
        pid INTEGER,
        error TEXT,
        failure_reason TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        sent_at INTEGER,
        ack_at INTEGER,
        completed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS server_operations_project_id_idx ON server_operations(project_id);
      CREATE INDEX IF NOT EXISTS server_operations_status_idx ON server_operations(status);
      CREATE INDEX IF NOT EXISTS server_operations_created_at_idx ON server_operations(created_at);
    `);
    
    console.log('SQLite database schema initialized successfully');
  }
}

/**
 * Create a SQLite database client
 */
export function createSqliteClient(): SqliteClient {
  const dbPath = getSqlitePath();
  
  console.log(`Initializing SQLite database at: ${dbPath}`);
  
  // Ensure directory exists
  ensureDbDirectory(dbPath);
  
  // Create SQLite connection
  const sqlite = new Database(dbPath);
  
  // Enable WAL mode for better performance
  sqlite.pragma('journal_mode = WAL');
  
  // Enable foreign keys
  sqlite.pragma('foreign_keys = ON');
  
  // Ensure schema exists
  ensureSchema(sqlite);
  
  // Store raw connection for cleanup
  global.__sqliteRaw = sqlite;
  
  // Create Drizzle client
  const client = drizzle(sqlite, { schema });
  
  return client;
}

/**
 * Initialize the SQLite database connection
 */
export async function initializeSqliteDatabase(): Promise<SqliteClient> {
  if (global.__sqliteDb) {
    return global.__sqliteDb;
  }
  
  const client = createSqliteClient();
  global.__sqliteDb = client;
  return client;
}

/**
 * Get the SQLite database client
 */
export async function getSqliteDb(): Promise<SqliteClient> {
  if (global.__sqliteDb) {
    return global.__sqliteDb;
  }
  return initializeSqliteDatabase();
}

/**
 * Reset the SQLite database connection
 */
export function resetSqliteDatabase(): void {
  if (global.__sqliteRaw) {
    global.__sqliteRaw.close();
    global.__sqliteRaw = undefined;
  }
  global.__sqliteDb = undefined;
}

/**
 * Get a synchronous SQLite client (lazy loads on first access)
 */
export function getSqliteDbSync(): SqliteClient {
  if (!global.__sqliteDb) {
    global.__sqliteDb = createSqliteClient();
  }
  return global.__sqliteDb;
}
