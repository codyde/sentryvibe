# SentryVibe

A Next.js application featuring Claude Code AI agent integration with Sentry monitoring.

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

```bash
# 1. Build the Sentry SDKs from the PR branch
cd /Users/codydearkland/sentry-javascript/packages/node
yarn build
npm pack

cd /Users/codydearkland/sentry-javascript/packages/nextjs
yarn build:transpile
npm pack

# 2. Install in this project
cd /Users/codydearkland/sentryvibe
pnpm install
rm -rf .next

# 3. Start dev server
pnpm dev
```

**Note:** `package.json` includes `pnpm.overrides` to ensure the local tarballs are used for all dependency resolutions.

## Documentation

- **Sentry PR:** https://github.com/getsentry/sentry-javascript/pull/17844
- **Archived Docs:** See `docs/archive/` for historical development documentation
