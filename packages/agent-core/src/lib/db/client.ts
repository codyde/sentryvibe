import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from './schema';

declare global {
  var __db: NodePgDatabase<typeof schema> | undefined;
}

/**
 * Lazy-loaded database client
 * Only loads pg and creates connection when first accessed
 * This prevents 'Cannot find module pg' errors in environments without database
 */
function createDbClient(): NodePgDatabase<typeof schema> {
  if (global.__db) {
    return global.__db;
  }

  // Dynamic imports to prevent loading pg unless actually needed
  const { drizzle } = require('drizzle-orm/node-postgres');
  const { Pool } = require('pg');
  const schema = require('./schema');

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

  const client = drizzle(pool, { schema });
  global.__db = client;

  return client;
}

// Export a proxy that lazy-loads on first property access
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(target, prop) {
    const client = createDbClient();
    return (client as any)[prop];
  }
});

export default db;
