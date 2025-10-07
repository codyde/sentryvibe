# SentryVibe

A Next.js application featuring Claude Code AI agent integration with Sentry monitoring.

> **⚠️ IMPORTANT:** This project requires locally-built Sentry SDK packages from [PR #17844](https://github.com/getsentry/sentry-javascript/pull/17844). The Claude Code integration is not yet available in the published npm packages. See [Testing with Sentry SDK PR](#testing-with-sentry-sdk-pr) for installation instructions.

## Getting Started

### Install Dependencies

```bash
pnpm install
```

### Run Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to interact with the Claude Code agent.

### Database Setup & Migrations

This project uses Drizzle ORM with SQLite. Migrations live in the `drizzle/` directory and can be applied with `drizzle-kit`.

```bash
# Apply migrations to the default database defined in drizzle.config.ts
npx drizzle-kit push --config drizzle.config.ts

# Apply migrations to a different database file
DATABASE_URL=sentryvibe.db npx drizzle-kit push --config drizzle.config.ts

# Apply migrations manually with sqlite3 (optional)
sqlite3 sqlite.db ".read drizzle/0003_port_pool.sql"
sqlite3 sentryvibe.db ".read drizzle/0003_port_pool.sql"
```

> **Tip:** If you maintain multiple SQLite files (e.g., `sqlite.db`, `sentryvibe.db`), run the command once per database so every file receives the latest schema changes including the port allocation table.

## Configuration

The app is configured with Sentry for monitoring Claude Code agent interactions:

**`sentry.server.config.ts`:**
```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "your-dsn",
  integrations: [
    Sentry.claudeCodeIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
  ],
});
```

**`src/app/api/claude-agent/route.ts`:**
```typescript
import * as Sentry from '@sentry/nextjs';

const query = Sentry.createInstrumentedClaudeQuery();
```

## Testing with Sentry SDK PR

This project is currently testing [PR #17844](https://github.com/getsentry/sentry-javascript/pull/17844) which adds Claude Code Agent SDK instrumentation to Sentry.

### Installing PR-Based SDKs

#### Step 1: Add pnpm Overrides

**CRITICAL:** Add this to your `package.json` to force pnpm to use local tarballs for ALL dependency resolutions (including nested dependencies):

```json
{
  "pnpm": {
    "overrides": {
      "@sentry/node": "file:/Users/youruser/sentry-javascript/packages/node/sentry-node-10.17.0.tgz",
      "@sentry/nextjs": "file:/Users/youruser/sentry-javascript/packages/nextjs/sentry-nextjs-10.17.0.tgz"
    }
  }
}
```

**Why this is needed:** Without overrides, pnpm will resolve `@sentry/nextjs`'s dependency on `@sentry/node@10.17.0` to the npm registry version (which doesn't have the Claude Code integration), not your local tarball. Overrides force pnpm to use the local builds everywhere.

#### Step 2: Build and Install SDKs

```bash
# 1. Build the Sentry SDKs from the PR branch
cd /Users/youruser/sentry-javascript/packages/node
yarn build
npm pack

cd /Users/youruser/sentry-javascript/packages/nextjs
yarn build:transpile
npm pack

# 2. Install in this project (clean install recommended)
cd /Users/codydearkland/sentryvibe
rm -rf node_modules pnpm-lock.yaml
pnpm install
rm -rf .next

# 3. Start dev server
pnpm dev
```

#### Verifying Installation

```bash
# Test that exports are working
node -e "const s = require('@sentry/nextjs'); console.log('claudeCodeIntegration:', typeof s.claudeCodeIntegration)"
# Should output: claudeCodeIntegration: function
```

## Documentation

- **Sentry PR:** https://github.com/getsentry/sentry-javascript/pull/17844
- **Archived Docs:** See `docs/archive/` for historical development documentation
