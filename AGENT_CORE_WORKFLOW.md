# Agent-Core Package Workflow

## Overview

`@sentryvibe/agent-core` is a shared package used by all apps in the SentryVibe monorepo. To avoid build complexity and ensure maximum portability, it's distributed as a **local tarball package** (`.tgz` file) similar to the custom Sentry packages.

## How It Works

### Package Structure
```
packages/agent-core/          # Source code
  ├── src/                    # TypeScript source
  ├── dist/                   # Compiled output (gitignored)
  └── package.json

vendor/                       # Distribution packages (committed to git)
  └── sentryvibe-agent-core-0.1.0.tgz

apps/*/package.json           # Reference the .tgz file
  "dependencies": {
    "@sentryvibe/agent-core": "file:../../vendor/sentryvibe-agent-core-0.1.0.tgz"
  }
```

### Why This Approach?

**Before (workspace: dependencies):**
- ❌ Required coordinated builds
- ❌ Broke with tsx (used by broker)
- ❌ Complex prebuild hooks needed
- ❌ Deployment issues with missing dist/
- ❌ Different behavior in dev vs prod

**After (.tgz file dependencies):**
- ✅ No build coordination needed
- ✅ Works with all tools (tsx, webpack, Next.js, etc.)
- ✅ Simple npm-standard workflow
- ✅ Deployment works everywhere
- ✅ Consistent behavior across environments

## Workflows

### Making Changes to Agent-Core

When you modify code in `packages/agent-core/src/`:

```bash
# Option 1: Use the automation script (RECOMMENDED)
./scripts/update-agent-core.sh

# Option 2: Manual steps
cd packages/agent-core
pnpm build
pnpm pack
mv sentryvibe-agent-core-*.tgz ../../vendor/
cd ../..
pnpm install
```

The automation script handles everything:
1. Builds TypeScript → JavaScript
2. Packs into .tgz tarball
3. Moves to vendor/ directory
4. Updates all package.json files
5. Reinstalls dependencies

### Regular Development (No agent-core changes)

```bash
# Start dev servers
pnpm dev:all

# Build for production
pnpm build:all

# Build specific app
pnpm --filter sentryvibe build
```

No special build steps needed! 🎉

### Fresh Clone Setup

```bash
git clone <repo>
cd sentryvibe
pnpm install
```

That's it! The `.tgz` file is committed in `vendor/`, so it's already available.

### Deployment

Works on any platform (Vercel, Railway, etc.):

```bash
# Build command (in platform config)
pnpm build

# Start command
pnpm start
```

The `.tgz` file deploys with your repo, so no special build steps needed.

## Benefits

### For Development:
- **Fast** - No waiting for agent-core to rebuild
- **Simple** - Standard npm workflows
- **Reliable** - No magical workspace resolution

### For CI/CD:
- **Portable** - Works on any platform
- **Predictable** - Same package everywhere
- **Fast** - No build coordination

### For Team:
- **Clear** - Easy to understand
- **Standard** - Normal npm package workflow
- **Documented** - This file explains everything

## Versioning

When you make breaking changes to agent-core:

1. Update version in `packages/agent-core/package.json`
2. Run `./scripts/update-agent-core.sh`
3. Commit both the new .tgz and updated package.json files

The tarball filename will include the version (e.g., `sentryvibe-agent-core-0.2.0.tgz`).

## Troubleshooting

### "Cannot find module @sentryvibe/agent-core"

```bash
# Reinstall dependencies
pnpm install

# If still broken, rebuild the package
./scripts/update-agent-core.sh
```

### "Type definitions not found"

Check that `packages/agent-core/package.json` exports include your path:

```json
"exports": {
  "./lib/*": { "types": "./dist/lib/*.d.ts", "default": "./dist/lib/*.js" },
  "./shared/runner/messages": { "types": "./dist/shared/runner/messages.d.ts", ... }
}
```

### Changes to agent-core not reflected

You forgot to run `./scripts/update-agent-core.sh`! The old .tgz is still installed.

## File Locations

- **Source:** `packages/agent-core/src/`
- **Compiled:** `packages/agent-core/dist/` (gitignored)
- **Package:** `vendor/sentryvibe-agent-core-0.1.0.tgz` (committed)
- **Script:** `scripts/update-agent-core.sh`

## Summary

This approach trades a small manual step (running update script) for **massive simplification**:
- No build orchestration
- No prebuild hooks
- No workspace: magic
- Standard npm workflow
- Works everywhere

It's the same pattern used successfully by the Sentry custom packages in this repo!
