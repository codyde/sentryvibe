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

  const parsePositiveInt = (value: string | undefined, fallback: number) => {
    if (!value) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  const pool = new Pool({
    connectionString,
    ssl: process.env.PGSSLMODE === 'disable'
      ? false
      : { rejectUnauthorized: false },
    max: parsePositiveInt(process.env.PG_POOL_MAX, 10),
    idleTimeoutMillis: parsePositiveInt(process.env.PG_IDLE_TIMEOUT_MS, 10_000),
    connectionTimeoutMillis: parsePositiveInt(process.env.PG_CONNECTION_TIMEOUT_MS, 5_000),
    maxUses: parsePositiveInt(process.env.PG_MAX_USES, 7_500),
    keepAlive: process.env.PG_KEEPALIVE === '0' ? false : true,
    keepAliveInitialDelayMillis: parsePositiveInt(
      process.env.PG_KEEPALIVE_INITIAL_DELAY_MS,
      10_000
    ),
    allowExitOnIdle: process.env.PG_ALLOW_EXIT_ON_IDLE === '1',
  });

  pool.on('error', (error) => {
    console.error('[db] Unexpected PostgreSQL pool error', error);
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
