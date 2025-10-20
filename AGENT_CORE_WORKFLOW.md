# Agent Core Workflow

## Overview

`@sentryvibe/agent-core` is now treated like any other workspace package. The TypeScript sources inside `packages/agent-core/` compile to `dist/` during normal installs and builds, and every app depends on the workspace output instead of a pre-built `.tgz`.

Key changes:

- The package owns its own build via `prepare`/`prepack` scripts, so `dist/` is always present when the CLI is packed or an app installs dependencies.
- The web app, broker, and CLI all point at `workspace:*`, so local development, CI, and production use the exact same source.
- The CLI includes agent-core via `bundledDependencies`, eliminating the bespoke tarball that used to live in `vendor/`.

## File Layout

```
packages/agent-core/
  ├── src/            # TypeScript source
  ├── dist/           # Compiled output (ignored by git)
  ├── package.json    # Includes prepare/prepack scripts
  └── tsconfig.json
```

Apps consume agent-core directly from the workspace:

```
apps/sentryvibe/package.json      "@sentryvibe/agent-core": "workspace:*"
apps/broker/package.json          "@sentryvibe/agent-core": "workspace:*"
apps/runner/package.json          "@sentryvibe/agent-core": "workspace:*"
```

The CLI marks it as a bundled dependency so the compiled output ships with the published tarball.

## Everyday Development

Individual developers do not need to run special scripts when they touch agent-core.

```bash
# Start everything (agent-core will build automatically on install)
pnpm install
pnpm dev:all
```

When you change `packages/agent-core/src/**`, rebuild it with:

```bash
pnpm --filter @sentryvibe/agent-core build
```

The `prepare` hook ensures the compiled `dist` directory exists whenever `pnpm install` runs, so Next.js, the broker, and the CLI all consume the latest TypeScript output.

## CLI Packaging

1. Ensure dependencies are installed: `pnpm install`
2. Build agent-core: `pnpm --filter @sentryvibe/agent-core build`
3. Build the CLI: `pnpm --filter @sentryvibe/runner-cli build`
4. Run the release prep script: `node apps/runner/scripts/prepare-release.js`
5. Package the CLI: `cd apps/runner && pnpm pack`

`prepare-release.js` rewrites `apps/runner/package.json` so the four patched Sentry packages use npm versions for publishing, and it pins `@sentryvibe/agent-core` to the current workspace version while keeping it in `bundledDependencies`. After tagging and publishing, reset the file with `git checkout -- apps/runner/package.json`.

## CI/CD and Deployments

- GitHub Actions runs `pnpm --filter @sentryvibe/agent-core build` before building the CLI, ensuring the bundle includes the compiled output without generating an intermediate tarball.
- All hosted environments (Vercel, Railway, Docker) keep using `pnpm install` followed by the normal build scripts. Because every consumer depends on `workspace:*`, runtime behaviour is consistent between local, CI, and production.
- The vendored Sentry packages are still committed under `apps/runner/vendor/` and remain untouched by this workflow.

## When to Bump Versions

If you introduce breaking changes to agent-core, bump the version in `packages/agent-core/package.json`. The release script will automatically reflect the new version in the CLI’s packaged manifest. Consumers pinned with `workspace:*` pick up the change immediately.

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `Cannot find module '@sentryvibe/agent-core'` | Run `pnpm install` so the workspace dependency is linked, then rebuild with `pnpm --filter @sentryvibe/agent-core build`. |
| CLI tarball missing agent-core | Re-run the release prep script, then `pnpm pack`. Confirm `bundledDependencies` still lists `@sentryvibe/agent-core`. |
| Stale types in apps | Clean the build with `rm -rf packages/agent-core/dist` and rebuild via `pnpm --filter @sentryvibe/agent-core build`. |

## Summary

- No more tarball management or mode toggles.
- Agent-core compiles automatically on install and before packing.
- All apps and the CLI share the same workspace dependency, ensuring behaviour is identical across environments.
