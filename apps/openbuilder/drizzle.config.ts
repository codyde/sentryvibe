import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './node_modules/@openbuilder/agent-core/dist/lib/db/schema.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
