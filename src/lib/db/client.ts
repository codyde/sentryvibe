import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

const dbUrl = process.env.DATABASE_URL || 'sqlite.db';

// Create SQLite connection
const sqlite = new Database(dbUrl);

// Enable WAL mode for better concurrency
sqlite.pragma('journal_mode = WAL');

// Create Drizzle instance
export const db = drizzle(sqlite, { schema });

export default db;
