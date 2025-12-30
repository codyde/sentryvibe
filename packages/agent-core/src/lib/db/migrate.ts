/**
 * Database migration utilities for PostgreSQL
 */

/**
 * Run migrations for PostgreSQL using drizzle-kit
 */
export async function runMigrations(migrationsFolder: string = './drizzle') {
  const { drizzle } = require('drizzle-orm/node-postgres');
  const { migrate } = require('drizzle-orm/node-postgres/migrator');
  const { Pool } = require('pg');

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
  const db = drizzle(pool);

  console.log('🔄 Running PostgreSQL database migrations...');

  try {
    await migrate(db, { migrationsFolder });
    console.log('✅ Migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run migrations if this file is executed directly
if (typeof require !== 'undefined' && require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
