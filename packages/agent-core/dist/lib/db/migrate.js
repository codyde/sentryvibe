"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
const node_postgres_1 = require("drizzle-orm/node-postgres");
const migrator_1 = require("drizzle-orm/node-postgres/migrator");
const pg_1 = require("pg");
async function runMigrations() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL is not set.');
    }
    const pool = new pg_1.Pool({
        connectionString,
        ssl: process.env.PGSSLMODE === 'disable'
            ? false
            : { rejectUnauthorized: false },
    });
    const db = (0, node_postgres_1.drizzle)(pool);
    console.log('🔄 Running database migrations...');
    try {
        await (0, migrator_1.migrate)(db, { migrationsFolder: './drizzle' });
        console.log('✅ Migrations completed successfully');
    }
    catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
    finally {
        await pool.end();
    }
}
// Run migrations if this file is executed directly
if (typeof require !== 'undefined' && require.main === module) {
    runMigrations()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}
