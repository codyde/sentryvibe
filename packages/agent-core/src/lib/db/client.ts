import type { NodePgDatabase } from 'drizzle-orm/node-postgres/driver.js';

// Database client type (PostgreSQL only)
export type DatabaseClient = NodePgDatabase<any>;

declare global {
  var __db: DatabaseClient | undefined;
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
    throw new Error(
      'DATABASE_URL is not set. Please configure your database connection:\n' +
      '  - Run "sentryvibe init" to set up a Neon database\n' +
      '  - Or set DATABASE_URL environment variable to your PostgreSQL connection string'
    );
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
 * Initialize the database connection
 */
export async function initializeDatabase(): Promise<DatabaseClient> {
  if (global.__db) {
    return global.__db;
  }
  
  const client = createPostgresClient();
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
  global.__db = undefined;
}

/**
 * Synchronous database client - lazy loads on first access
 */
export const db = new Proxy({} as NodePgDatabase<any>, {
  get(_target, prop) {
    if (!global.__db) {
      global.__db = createPostgresClient();
    }
    return (global.__db as any)[prop];
  }
});

export default db;
