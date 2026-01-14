import { defineConfig } from 'drizzle-kit';
import { homedir } from 'os';
import { join } from 'path';

// Default SQLite database path
const dbPath = process.env.DATABASE_PATH || join(homedir(), '.sentryvibe', 'data.db');

export default defineConfig({
  schema: './node_modules/@sentryvibe/agent-core/dist/lib/db/schema.sqlite.js',
  out: './drizzle-sqlite',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbPath,
  },
});
