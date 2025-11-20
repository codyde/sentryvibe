import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool, PoolConfig } from 'pg';

declare global {
  var __db: NodePgDatabase<any> | undefined;
  var __pgPool: Pool | undefined;
}

const isPoolDebugEnabled = process.env.SENTRYVIBE_DEBUG_DB_POOL === '1';

const DEFAULT_POOL_MAX = 10;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_USES = 750;

function envNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildPoolConfig(connectionString: string): PoolConfig {
  const config: PoolConfig = {
    connectionString,
    ssl: process.env.PGSSLMODE === 'disable'
      ? false
      : { rejectUnauthorized: false },
    max: envNumber('PG_POOL_MAX', DEFAULT_POOL_MAX),
    idleTimeoutMillis: envNumber('PG_IDLE_TIMEOUT_MS', DEFAULT_IDLE_TIMEOUT_MS),
    connectionTimeoutMillis: envNumber(
      'PG_CONNECTION_TIMEOUT_MS',
      DEFAULT_CONNECTION_TIMEOUT_MS
    ),
    keepAlive: process.env.PG_KEEPALIVE === '0' ? false : true,
  };

  const maxUses = envNumber('PG_POOL_MAX_USES', DEFAULT_MAX_USES);
  if (maxUses > 0) {
    config.maxUses = maxUses;
  }

  const keepAliveDelay = process.env.PG_KEEPALIVE_INITIAL_DELAY_MS;
  if (keepAliveDelay) {
    const parsedDelay = Number(keepAliveDelay);
    if (Number.isFinite(parsedDelay) && parsedDelay >= 0) {
      config.keepAliveInitialDelayMillis = parsedDelay;
    }
  }

  return config;
}

export function resetDbClient(reason?: unknown) {
  if (isPoolDebugEnabled && reason) {
    console.warn('[db] Resetting Postgres client due to error:', reason);
  }

  const currentPool = global.__pgPool;
  global.__pgPool = undefined;
  global.__db = undefined;

  if (currentPool) {
    void currentPool.end().catch((err: unknown) => {
      if (isPoolDebugEnabled) {
        console.warn('[db] Failed to gracefully end Postgres pool:', err);
      }
    });
  }
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

  const poolConfig = buildPoolConfig(connectionString);
  if (isPoolDebugEnabled) {
    const { connectionString: _omit, ...safeConfig } = poolConfig;
    console.log('[db] Creating Postgres pool with config:', safeConfig);
  }

  const pool = new Pool(poolConfig);

  pool.on('error', (err: unknown) => {
    console.error('[db] Unexpected Postgres pool error:', err);
  });

  const client = drizzle(pool, { schema: schemaModule });
  global.__db = client;
  global.__pgPool = pool;

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
