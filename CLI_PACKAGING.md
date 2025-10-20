# SentryVibe CLI Packaging Guide

## Overview

The runner CLI (`@sentryvibe/runner-cli`) now consumes `@sentryvibe/agent-core` directly from the workspace. The CLI bundles the compiled output through `bundledDependencies`, so no agent-core tarball is copied into `vendor/`. The only tarballs that remain in `apps/runner/vendor/` are the patched Sentry builds.

## Prerequisites

- `pnpm install`
- Ensure `apps/runner/vendor/` contains the four patched Sentry archives:
  - `sentry-core-LOCAL.tgz`
  - `sentry-node-LOCAL.tgz`
  - `sentry-node-core-LOCAL.tgz`
  - `sentry-nextjs-LOCAL.tgz`

## Standard Build

```bash
# From repo root
pnpm install
pnpm --filter @sentryvibe/agent-core build
pnpm --filter @sentryvibe/runner-cli build
```

The `prepare` hook in `packages/agent-core` runs automatically on install, but running the explicit build ensures fresh output before packaging.

## Preparing a Release Tarball

```bash
# 1. Install and build
pnpm install
pnpm --filter @sentryvibe/agent-core build
pnpm --filter @sentryvibe/runner-cli build

# 2. Rewrite package.json for publishing
node apps/runner/scripts/prepare-release.js

# 3. Pack the CLI
cd apps/runner
pnpm pack
```

`prepare-release.js` performs two tasks:

1. Converts the local `file:` references for Sentry packages to their registry versions so a global install succeeds.
2. Pins `@sentryvibe/agent-core` to the current workspace version and ensures it stays in `bundledDependencies`. During `pnpm pack` the folder from `node_modules/@sentryvibe/agent-core` is embedded in the CLI tarball, so the runner does not need to download it separately.

After publishing, revert `apps/runner/package.json` via `git checkout -- apps/runner/package.json`.

## Verifying the Artifact

```bash
cd apps/runner
pnpm pack --dry-run
tar -tzf sentryvibe-cli.tgz | head
```

Confirm the tarball includes:

- `dist/`
- `vendor/` (four Sentry tarballs)
- `node_modules/@sentryvibe/agent-core/**` (bundled dependency produced by prepare-release)
- `scripts/install-vendor.js`
- `templates.json`

For a full test, install the tarball globally:

```bash
npm install -g ./sentryvibe-cli.tgz
sentryvibe --version
sentryvibe run --help
```

## GitHub Actions

`.github/workflows/release-cli.yml` now:

1. Runs `pnpm --filter @sentryvibe/agent-core build`.
2. Verifies only the Sentry tarballs live under `apps/runner/vendor/`.
3. Builds the CLI and runs `prepare-release.js`.
4. Packs the CLI and publishes the artifact.

No additional toggles or tarball updates are required.

## FAQ

**Do I need to rebuild agent-core manually?**  
Only when you change its source. Use `pnpm --filter @sentryvibe/agent-core build`. The prepare/prepack scripts make sure the compiled files exist whenever the package is packed.

**What happened to `toggle-dev-mode.sh` and `update-agent-core.sh`?**  
They are no longer needed. Workspace linking provides fast iteration, and bundling handles distribution.

**Where did the agent-core tarball go?**  
It has been removed. The CLI now bundles the compiled workspace package directly. Only the custom Sentry tarballs remain in `vendor/`.

**Can I still publish the CLI to npm?**  
Yes. `prepare-release.js` converts dependencies to public versions and ensures agent-core is bundled, so `npm publish` or GitHub releases work the same as before.
