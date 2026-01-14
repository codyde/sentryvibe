/**
 * Unified database client
 * 
 * Automatically selects the appropriate database client based on MODE:
 * - MODE=LOCAL  -> SQLite (better-sqlite3)
 * - MODE=HOSTED -> PostgreSQL (pg)
 * 
 * Default: LOCAL for easiest onboarding
 */

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { isLocalMode, isHostedMode } from './mode.js';

// Import schema types for type definitions
import type * as pgSchema from './schema.pg.js';
import type * as sqliteSchema from './schema.sqlite.js';

// Import both client modules statically - bundler includes both
// At runtime, we call the appropriate one based on MODE
import { createSqliteClient, resetSqliteDatabase } from './client.sqlite.js';
import { createPostgresClient } from './client.pg.js';

// For external consumers who need the specific types
export type PostgresClient = NodePgDatabase<typeof pgSchema>;
export type SqliteClient = BetterSQLite3Database<typeof sqliteSchema>;

/**
 * Unified database client type
 * 
 * We use `any` here because Drizzle's PostgreSQL and SQLite clients have
 * incompatible type signatures that TypeScript can't union properly.
 * The actual runtime type will be correct based on MODE.
 * 
 * When you need type-safe access to dialect-specific features:
 * - Use `isLocalMode()` / `isHostedMode()` guards
 * - Cast to `PostgresClient` or `SqliteClient` as needed
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DatabaseClient = any;

// Global variable for the unified database client
// Declared without augmenting global scope to avoid conflicts with client-specific globals
let _globalDb: DatabaseClient | undefined;

// Also check the global object for backwards compatibility
declare const global: { __db?: DatabaseClient };

/**
 * Create the appropriate database client based on MODE
 */
function createDatabaseClient(): DatabaseClient {
  if (isLocalMode()) {
    return createSqliteClient();
  } else {
    return createPostgresClient();
  }
}

/**
 * Get the cached database client
 */
function getCachedDb(): DatabaseClient | undefined {
  return _globalDb ?? (typeof global !== 'undefined' ? global.__db : undefined);
}

/**
 * Set the cached database client
 */
function setCachedDb(client: DatabaseClient): void {
  _globalDb = client;
  if (typeof global !== 'undefined') {
    global.__db = client;
  }
}

/**
 * Initialize the database connection
 */
export async function initializeDatabase(): Promise<DatabaseClient> {
  const cached = getCachedDb();
  if (cached) {
    return cached;
  }
  
  const mode = isLocalMode() ? 'LOCAL (SQLite)' : 'HOSTED (PostgreSQL)';
  console.log(`Initializing database in ${mode} mode...`);
  
  const client = createDatabaseClient();
  setCachedDb(client);
  return client;
}

/**
 * Get the database client (async version)
 */
export async function getDb(): Promise<DatabaseClient> {
  const cached = getCachedDb();
  if (cached) {
    return cached;
  }
  return initializeDatabase();
}

/**
 * Reset the database connection (useful for testing)
 */
export function resetDatabase(): void {
  if (isLocalMode()) {
    resetSqliteDatabase();
  }
  _globalDb = undefined;
  if (typeof global !== 'undefined') {
    global.__db = undefined;
  }
}

/**
 * Synchronous database client - lazy loads on first access
 * 
 * This uses a Proxy to provide synchronous access while still
 * allowing lazy initialization.
 */
export const db = new Proxy({} as DatabaseClient, {
  get(_target, prop) {
    let cached = getCachedDb();
    if (!cached) {
      cached = createDatabaseClient();
      setCachedDb(cached);
    }
    return (cached as any)[prop];
  }
});

export default db;

// Re-export mode helpers for convenience
export { isLocalMode, isHostedMode, getDatabaseMode } from './mode.js';
