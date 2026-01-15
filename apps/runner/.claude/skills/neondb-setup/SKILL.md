---
name: neondb-setup
description: |
  Set up NeonDB PostgreSQL database with Drizzle ORM for a project.
  Use when the user wants to configure NeonDB or add serverless Postgres.
---

# NeonDB Setup Skill

Provision a NeonDB serverless PostgreSQL database and configure Drizzle ORM.

## Setup Steps

1. **Run the neondb CLI:**
   ```bash
   npx neondb -y
   ```
   This instantly creates a database and writes `DATABASE_URL` to `.env`.

2. **Install PostgreSQL and Drizzle packages:**
   ```bash
   npm install drizzle-orm pg
   npm install -D drizzle-kit @types/pg
   ```
   Note: Use standard `pg` package - NeonDB is a PostgreSQL database.

3. **Create Drizzle config** at `drizzle.config.ts`:
   ```typescript
   import { defineConfig } from 'drizzle-kit';

   export default defineConfig({
     dialect: 'postgresql',
     schema: './src/db/schema.ts',
     out: './drizzle',
     dbCredentials: {
       url: process.env.DATABASE_URL!,
     },
   });
   ```

4. **Create database connection** at `src/db/index.ts`:
   ```typescript
   import { drizzle } from 'drizzle-orm/node-postgres';
   import { Pool } from 'pg';
   import * as schema from './schema';

   const pool = new Pool({
     connectionString: process.env.DATABASE_URL!,
   });

   export const db = drizzle(pool, { schema });
   ```

5. **Create example schema** at `src/db/schema.ts`:
   ```typescript
   import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

   export const users = pgTable('users', {
     id: serial('id').primaryKey(),
     name: text('name').notNull(),
     email: text('email').notNull().unique(),
     createdAt: timestamp('created_at').defaultNow().notNull(),
   });
   ```

6. **Add database scripts** to `package.json`:
   ```json
   {
     "scripts": {
       "db:generate": "drizzle-kit generate",
       "db:migrate": "drizzle-kit migrate",
       "db:push": "drizzle-kit push",
       "db:studio": "drizzle-kit studio"
     }
   }
   ```

7. **Push schema to database:**
   ```bash
   npm run db:push
   ```

8. **Output the result** (MANDATORY):
   ```
   NEONDB_RESULT:{"success":true,"action":"setup"}
   ```

## Important

- Database expires in 72 hours unless claimed
- Claim URL is in the `.env` file - inform the user to save it
- Ensure `.env` is in `.gitignore`
- Use `db:push` for development, `db:generate` + `db:migrate` for production

## Cleanup

After success, remove this skill:
```bash
rm -rf .claude/skills/neondb-setup
rmdir .claude/skills .claude 2>/dev/null
```

## NEONDB_RESULT Schema

```typescript
{
  success: boolean;
  action: "setup" | "error";
  error?: string;
}
```

Your response MUST include `NEONDB_RESULT:{...}` for the UI to update.
