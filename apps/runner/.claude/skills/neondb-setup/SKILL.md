---
name: neondb-setup
description: |
  Set up NeonDB PostgreSQL database for a project.
  Use when the user wants to configure NeonDB or add serverless Postgres.
---

# NeonDB Setup Skill

Provision a NeonDB serverless PostgreSQL database instantly using `npx neondb -y`.

## Setup Steps

1. **Run the neondb CLI:**
   ```bash
   npx neondb -y
   ```
   This instantly creates a database and writes `DATABASE_URL` to `.env`.

2. **Install the Neon driver:**
   ```bash
   npm install @neondatabase/serverless
   ```

3. **Create database utility** at `src/db/index.ts`:
   ```typescript
   import { neon } from '@neondatabase/serverless';
   
   export const sql = neon(process.env.DATABASE_URL!);
   ```

4. **Output the result** (MANDATORY):
   ```
   NEONDB_RESULT:{"success":true,"action":"setup"}
   ```

## Important

- Database expires in 72 hours unless claimed
- Claim URL is in the `.env` file - inform the user to save it
- Ensure `.env` is in `.gitignore`

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
