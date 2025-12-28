import type { NodePgDatabase } from 'drizzle-orm/node-postgres/driver.js';
import type { PgliteDatabase } from 'drizzle-orm/pglite/driver.js';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Union type for both database types
export type DatabaseClient = NodePgDatabase<any> | PgliteDatabase<any>;

// Database mode type
export type DatabaseMode = 'postgres' | 'pglite';

declare global {
  var __db: DatabaseClient | undefined;
  var __dbMode: DatabaseMode | undefined;
}

/**
 * Get the default PGlite data directory
 */
export function getPgliteDataDir(): string {
  const dataDir = process.env.PGLITE_DATA_DIR || join(homedir(), '.sentryvibe', 'data');
  return dataDir;
}

/**
 * Determine which database mode to use based on environment
 */
export function getDatabaseMode(): DatabaseMode {
  // Explicit mode override
  if (process.env.DATABASE_MODE === 'pglite') {
    return 'pglite';
  }
  if (process.env.DATABASE_MODE === 'postgres') {
    return 'postgres';
  }
  
  // If DATABASE_URL is set, use postgres
  if (process.env.DATABASE_URL) {
    return 'postgres';
  }
  
  // Default to pglite for local development
  return 'pglite';
}

/**
 * Check if PGlite is being used
 */
export function isPgliteMode(): boolean {
  return getDatabaseMode() === 'pglite';
}

/**
 * Create a PGlite database client
 */
async function createPgliteClient(): Promise<PgliteDatabase<any>> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schemaModule = await import('./schema.js');
  
  const dataDir = getPgliteDataDir();
  
  // Ensure the data directory exists
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  
  console.log(`Using local database at: ${dataDir}`);
  
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema: schemaModule });
  
  return db as PgliteDatabase<any>;
}

/**
 * Create a PostgreSQL database client
 */
function createPostgresClient(): NodePgDatabase<any> {
  const { drizzle } = require('drizzle-orm/node-postgres');
  const { Pool } = require('pg');
  const schemaModule = require('./schema');

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

  const client = drizzle(pool, { schema: schemaModule });
  return client;
}

/**
 * Lazy-loaded database client
 * Supports both PGlite (local) and PostgreSQL (remote)
 */
async function createDbClientAsync(): Promise<DatabaseClient> {
  if (global.__db) {
    return global.__db;
  }

  const mode = getDatabaseMode();
  global.__dbMode = mode;
  
  let client: DatabaseClient;
  
  if (mode === 'pglite') {
    client = await createPgliteClient();
  } else {
    client = createPostgresClient();
  }
  
  global.__db = client;
  return client;
}

/**
 * Synchronous database client creation (for backward compatibility)
 * Only works with PostgreSQL mode
 */
function createDbClientSync(): NodePgDatabase<any> {
  if (global.__db) {
    return global.__db as NodePgDatabase<any>;
  }

  const mode = getDatabaseMode();
  
  if (mode === 'pglite') {
    throw new Error(
      'PGlite mode requires async initialization. Use getDb() or initializeDatabase() instead.'
    );
  }
  
  global.__dbMode = 'postgres';
  const client = createPostgresClient();
  global.__db = client;
  
  return client;
}

/**
 * Initialize the database (call this at startup)
 * Required for PGlite mode, optional for PostgreSQL mode
 */
export async function initializeDatabase(): Promise<DatabaseClient> {
  return createDbClientAsync();
}

/**
 * Get the database client (async version - preferred)
 */
export async function getDb(): Promise<DatabaseClient> {
  if (global.__db) {
    return global.__db;
  }
  return createDbClientAsync();
}

/**
 * Get the current database mode
 */
export function getCurrentDatabaseMode(): DatabaseMode | undefined {
  return global.__dbMode;
}

/**
 * Reset the database connection (useful for testing)
 */
export function resetDatabase(): void {
  global.__db = undefined;
  global.__dbMode = undefined;
}

// Export a proxy that lazy-loads on first property access
// Note: This only works with PostgreSQL mode for backward compatibility
// For PGlite support, use getDb() or initializeDatabase()
export const db = new Proxy({} as NodePgDatabase<any>, {
  get(_target, prop) {
    const client = createDbClientSync();
    return (client as any)[prop];
  }
});

export default db;
