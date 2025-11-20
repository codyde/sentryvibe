import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

declare global {
  var __db: NodePgDatabase<any> | undefined;
  var __dbPool: Pool | undefined;
}

/**
 * Lazy-loaded database client
 * Only loads pg and creates connection when first accessed
 * This prevents 'Cannot find module pg' errors in environments without database
 */
function parseIntEnv(key: string, defaultValue: number): number {
  const rawValue = process.env[key];
  if (!rawValue) return defaultValue;
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function createDbClient(): NodePgDatabase<any> {
  if (global.__db) {
    return global.__db;
  }

  // Dynamic imports to prevent loading pg unless actually needed
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
    max: parseIntEnv('PG_POOL_MAX', 10),
    idleTimeoutMillis: parseIntEnv('PG_IDLE_TIMEOUT_MS', 30_000),
    connectionTimeoutMillis: parseIntEnv('PG_CONNECTION_TIMEOUT_MS', 5_000),
    keepAlive: process.env.PG_POOL_KEEPALIVE !== '0',
    keepAliveInitialDelayMillis: parseIntEnv('PG_POOL_KEEPALIVE_INITIAL_DELAY_MS', 10_000),
  });
  global.__dbPool = pool;

  pool.on('error', (err: Error) => {
    console.error('[db] Unexpected idle client error, resetting pool', err);
    if (global.__dbPool === pool) {
      global.__db = undefined;
      global.__dbPool = undefined;
    }
  });

  const client = drizzle(pool, { schema: schemaModule });
  global.__db = client;

  return client;
}

// Export a proxy that lazy-loads on first property access
export const db = new Proxy({} as NodePgDatabase<any>, {
  get(target, prop) {
    const client = createDbClient();
    return (client as any)[prop];
  }
});

export default db;
