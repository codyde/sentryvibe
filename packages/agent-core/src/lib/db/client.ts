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

declare global {
  var __db: DatabaseClient | undefined;
}

/**
 * Create the appropriate database client based on MODE
 */
function createDatabaseClient(): DatabaseClient {
  if (isLocalMode()) {
    // Dynamic import to avoid loading better-sqlite3 in hosted mode
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSqliteClient } = require('./client.sqlite.js');
    return createSqliteClient();
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createPostgresClient } = require('./client.pg.js');
    return createPostgresClient();
  }
}

/**
 * Initialize the database connection
 */
export async function initializeDatabase(): Promise<DatabaseClient> {
  if (global.__db) {
    return global.__db;
  }
  
  const mode = isLocalMode() ? 'LOCAL (SQLite)' : 'HOSTED (PostgreSQL)';
  console.log(`Initializing database in ${mode} mode...`);
  
  const client = createDatabaseClient();
  global.__db = client;
  return client;
}

/**
 * Get the database client (async version)
 */
export async function getDb(): Promise<DatabaseClient> {
  if (global.__db) {
    return global.__db;
  }
  return initializeDatabase();
}

/**
 * Reset the database connection (useful for testing)
 */
export function resetDatabase(): void {
  if (isLocalMode()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { resetSqliteDatabase } = require('./client.sqlite.js');
    resetSqliteDatabase();
  }
  global.__db = undefined;
}

/**
 * Synchronous database client - lazy loads on first access
 * 
 * This uses a Proxy to provide synchronous access while still
 * allowing lazy initialization.
 */
export const db = new Proxy({} as DatabaseClient, {
  get(_target, prop) {
    if (!global.__db) {
      global.__db = createDatabaseClient();
    }
    return (global.__db as any)[prop];
  }
});

export default db;

// Re-export mode helpers for convenience
export { isLocalMode, isHostedMode, getDatabaseMode } from './mode.js';
