import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

declare global {
  var __db: NodePgDatabase<any> | undefined;
}

/**
 * Lazy-loaded database client
 * Only loads pg and creates connection when first accessed
 * This prevents 'Cannot find module pg' errors in environments without database
 */
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

  const parseNumber = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const pool = new Pool({
    connectionString,
    ssl: process.env.PGSSLMODE === 'disable'
      ? false
      : { rejectUnauthorized: false },
    max: parseNumber(process.env.PG_POOL_MAX ?? process.env.PG_MAX ?? '10', 10),
    idleTimeoutMillis: parseNumber(
      process.env.PG_POOL_IDLE_TIMEOUT_MS ?? '10000',
      10000
    ),
    connectionTimeoutMillis: parseNumber(
      process.env.PG_POOL_CONNECTION_TIMEOUT_MS ?? '5000',
      5000
    ),
    keepAlive: process.env.PG_POOL_KEEPALIVE === '0' ? false : true,
    keepAliveInitialDelayMillis: parseNumber(
      process.env.PG_POOL_KEEPALIVE_INITIAL_DELAY_MS ?? '0',
      0
    ),
    maxUses: parseNumber(process.env.PG_POOL_MAX_USES ?? '500', 500),
  });

  pool.on('error', (err: unknown) => {
    console.error('Unexpected database pool error. Resetting client.', err);
    global.__db = undefined;
    try {
      pool.end();
    } catch {
      // noop - failing to end just means we'll rely on process shutdown
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
