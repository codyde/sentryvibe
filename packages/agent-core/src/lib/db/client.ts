import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

declare global {
  var __dbPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set.');
}

const pool =
  global.__dbPool ??
  new Pool({
    connectionString,
    ssl: process.env.PGSSLMODE === 'disable'
      ? false
      : { rejectUnauthorized: false },
    // Connection timeout configuration to prevent TLS handshake timeouts
    connectionTimeoutMillis: 10000, // 10 seconds timeout for connection establishment
    // Idle connection management to prevent stale connections
    idleTimeoutMillis: 30000, // 30 seconds idle timeout
    // Allow pool to exit gracefully
    allowExitOnIdle: false,
    // Statement timeout to prevent long-running queries
    statement_timeout: 30000, // 30 seconds query timeout
    // Max number of clients in the pool
    max: 20,
  });

if (!global.__dbPool) {
  global.__dbPool = pool;
}

// Add error handler for connection pool errors
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

// Add connection handler for better debugging
pool.on('connect', (client) => {
  // Connection successful
});

// Add remove handler to track when connections are closed
pool.on('remove', (client) => {
  // Connection removed from pool
});

export const db = drizzle(pool, { schema });

export default db;
