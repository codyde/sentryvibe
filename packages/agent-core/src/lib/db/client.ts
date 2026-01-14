/**
 * Unified database client
 * 
 * Automatically selects the appropriate database client based on MODE:
 * - MODE=LOCAL  -> SQLite (better-sqlite3)
 * - MODE=HOSTED -> PostgreSQL (pg)
 * 
 * Default: LOCAL for easiest onboarding
 */

import { isLocalMode, isHostedMode } from './mode.js';

// We use `any` for the database client type because Drizzle's PostgreSQL and SQLite 
// clients have incompatible type signatures that TypeScript can't union properly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DatabaseClient = any;

// Use globalThis to share state across all module instances
// This is necessary because tsup bundles each entry point separately with splitting: false
// Without this, each bundle would have its own _globalDb variable
declare global {
  // eslint-disable-next-line no-var
  var __sentryvibeDb: DatabaseClient | undefined;
  // eslint-disable-next-line no-var
  var __sentryvibeDbInitPromise: Promise<DatabaseClient> | undefined;
}

// Initialize globals if not already set
globalThis.__sentryvibeDb = globalThis.__sentryvibeDb;
globalThis.__sentryvibeDbInitPromise = globalThis.__sentryvibeDbInitPromise;

/**
 * Dynamically import and create the appropriate database client based on MODE
 * This ensures we only load the client module we actually need.
 */
async function createDatabaseClientAsync(): Promise<DatabaseClient> {
  if (isLocalMode()) {
    // Dynamic import - only loads better-sqlite3 in LOCAL mode
    const { createSqliteClient } = await import('./client.sqlite.js');
    return createSqliteClient();
  } else {
    // Dynamic import - only loads pg in HOSTED mode
    const { createPostgresClient } = await import('./client.pg.js');
    return createPostgresClient();
  }
}

/**
 * Initialize the database connection (async - preferred)
 * 
 * This is the recommended way to initialize the database.
 * It uses dynamic imports to only load the client module needed for the current mode.
 */
export async function initializeDatabase(): Promise<DatabaseClient> {
  if (globalThis.__sentryvibeDb) {
    return globalThis.__sentryvibeDb;
  }
  
  // Prevent multiple concurrent initializations
  if (globalThis.__sentryvibeDbInitPromise) {
    return globalThis.__sentryvibeDbInitPromise;
  }
  
  const mode = isLocalMode() ? 'LOCAL (SQLite)' : 'HOSTED (PostgreSQL)';
  console.log(`Initializing database in ${mode} mode...`);
  
  globalThis.__sentryvibeDbInitPromise = createDatabaseClientAsync().then(client => {
    globalThis.__sentryvibeDb = client;
    globalThis.__sentryvibeDbInitPromise = undefined;
    return client;
  });
  
  return globalThis.__sentryvibeDbInitPromise;
}

/**
 * Get the database client (async version)
 */
export async function getDb(): Promise<DatabaseClient> {
  if (globalThis.__sentryvibeDb) {
    return globalThis.__sentryvibeDb;
  }
  return initializeDatabase();
}

/**
 * Reset the database connection (useful for testing)
 */
export async function resetDatabase(): Promise<void> {
  if (isLocalMode() && globalThis.__sentryvibeDb) {
    const { resetSqliteDatabase } = await import('./client.sqlite.js');
    resetSqliteDatabase();
  }
  globalThis.__sentryvibeDb = undefined;
  globalThis.__sentryvibeDbInitPromise = undefined;
}

/**
 * Synchronous database client accessor
 * 
 * IMPORTANT: This requires initializeDatabase() to have been called first!
 * The database is initialized in instrumentation.ts before any routes run.
 * 
 * This uses a Proxy to provide synchronous access to the pre-initialized client.
 * If accessed before initialization, it throws a helpful error.
 */
export const db = new Proxy({} as DatabaseClient, {
  get(_target, prop) {
    if (!globalThis.__sentryvibeDb) {
      throw new Error(
        'Database not initialized. Ensure initializeDatabase() is called during startup.\n' +
        'This should happen automatically in instrumentation.ts.'
      );
    }
    return (globalThis.__sentryvibeDb as any)[prop];
  }
});

export default db;

// Re-export mode helpers for convenience
export { isLocalMode, isHostedMode, getDatabaseMode } from './mode.js';
