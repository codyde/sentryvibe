# SentryVibe CLI Packaging Guide

## Overview

The SentryVibe CLI (`@sentryvibe/runner-cli`) is a standalone package that needs to be properly built and packaged before publishing or releasing.

## 🔄 Development vs Production Modes

### **Development Mode** (Default - Fast Iteration)
```json
"@sentryvibe/agent-core": "workspace:*"
```
- ✅ Changes to `packages/agent-core` picked up on restart
- ✅ No tarball rebuilds needed
- ✅ Fast iteration
- ⚠️ **Don't ship this way!**

### **Production Mode** (For CLI Distribution)
```json
"@sentryvibe/agent-core": "file:../../vendor/sentryvibe-agent-core-0.1.0.tgz"
```
- ✅ Self-contained package
- ✅ No workspace dependencies
- ✅ Works when installed globally
- ✅ **Ready to ship!**

### **Switching Modes**

```bash
# Development mode (currently active)
./scripts/toggle-dev-mode.sh dev

# Production mode (before packaging CLI)
./scripts/toggle-dev-mode.sh prod
```

**IMPORTANT:** Always run `./scripts/toggle-dev-mode.sh prod` before packaging the CLI!

---

## Package Structure

```
apps/runner/
├── dist/                    # Compiled TypeScript (created by build)
│   ├── cli/                 # CLI entry points
│   ├── lib/                 # Core runner logic
│   └── index.js             # Main entry point
├── vendor/                  # Bundled dependencies (must be included!)
│   ├── sentry-core-LOCAL.tgz
│   ├── sentry-node-LOCAL.tgz
│   ├── sentry-node-core-LOCAL.tgz
│   ├── sentry-nextjs-LOCAL.tgz
│   └── sentryvibe-agent-core-0.1.0.tgz
├── scripts/
│   └── install-vendor.js    # Postinstall script to unpack vendor packages
├── templates.json           # Template definitions
└── package.json
```

---

## Build Process

### 1. Build Agent Core

The runner depends on `@sentryvibe/agent-core`, which must be built and packed first:

```bash
cd packages/agent-core
pnpm build
pnpm pack
mv *.tgz ../../vendor/sentryvibe-agent-core-0.1.0.tgz
```

Or use the root script:
```bash
pnpm run build:agent-core
```

### 2. Ensure Vendor Packages Exist

The runner requires patched Sentry packages in `/apps/runner/vendor/`:
- `sentry-core-LOCAL.tgz`
- `sentry-node-LOCAL.tgz`
- `sentry-node-core-LOCAL.tgz`
- `sentry-nextjs-LOCAL.tgz`

These should already exist. If missing, you need to:
1. Build the patched Sentry packages from source
2. Pack them into tarballs
3. Place in `apps/runner/vendor/`

### 3. Build the CLI

```bash
cd apps/runner
pnpm build
```

This compiles TypeScript to `dist/` directory.

### 4. Package for Distribution

```bash
cd apps/runner
pnpm pack
```

This creates `sentryvibe-runner-cli-0.1.11.tgz` (or current version) which includes:
- `dist/` directory (compiled code)
- `vendor/` directory (5 tarball files)
- `scripts/` directory (install-vendor.js)
- `templates.json`
- `package.json`

### 5. Test Locally

Before releasing, test the package locally:

```bash
# From the generated .tgz
npm install -g ./sentryvibe-runner-cli-0.1.11.tgz

# Verify installation
sentryvibe --version

# Test commands
sentryvibe status
sentryvibe init --help
```

---

## Publishing to npm Registry

If you want to publish to npm (optional):

```bash
cd apps/runner

# Ensure you're logged in
npm login

# Publish (must have permissions for @sentryvibe scope)
npm publish --access public
```

Then users can install via:
```bash
npm install -g @sentryvibe/runner-cli
# or
pnpm add -g @sentryvibe/runner-cli
```

---

## GitHub Release Process

### 1. Create Release Tag

```bash
# Tag format: runner-cli-vX.Y.Z
git tag runner-cli-v0.1.11
git push origin runner-cli-v0.1.11
```

### 2. Create GitHub Release

1. Go to: https://github.com/codyde/sentryvibe/releases/new
2. Select tag: `runner-cli-v0.1.11`
3. Title: "SentryVibe CLI v0.1.11"
4. Upload the packaged `.tgz` file as: `sentryvibe-cli.tgz` (rename if needed)
5. Add release notes

### 3. Test Installation

After release is published:

```bash
curl -fsSL https://raw.githubusercontent.com/codyde/sentryvibe/main/install-cli.sh | bash
```

---

## Postinstall Behavior

When the CLI is installed (via `npm install -g` or `pnpm add -g`), the `postinstall` script runs automatically:

1. Checks if `vendor/` directory exists
2. Unpacks all `vendor/*.tgz` files to `node_modules/@sentry/*`
3. Ensures patched Sentry packages are used instead of published versions

This is **critical** for the CLI to work correctly with the instrumented Claude/Codex SDKs.

---

## Required Files in package.json

```json
{
  "files": [
    "dist/",
    "templates/",
    "vendor/",
    "scripts/",
    "templates.json"
  ],
  "scripts": {
    "postinstall": "node scripts/install-vendor.js"
  }
}
```

The `files` array determines what gets included in the `.tgz` when you run `pnpm pack`.

---

## Troubleshooting

### CLI not working after install

**Problem:** "Module not found" errors for @sentry packages

**Solution:** The postinstall script failed. Check:
```bash
# Find where CLI is installed
npm root -g

# Check if vendor packages were unpacked
ls -la $(npm root -g)/@sentry/
```

### Version mismatch

**Problem:** `sentryvibe --version` shows old version

**Solution:** Clear npm cache and reinstall:
```bash
npm cache clean --force
npm uninstall -g @sentryvibe/runner-cli
npm install -g https://github.com/codyde/sentryvibe/releases/download/runner-cli-vX.Y.Z/sentryvibe-cli.tgz
```

### Vendor packages not found

**Problem:** CLI package doesn't include vendor files

**Solution:** Verify `files` array in package.json includes `"vendor/"` and rebuild:
```bash
cd apps/runner
rm -rf dist/
pnpm build
pnpm pack
```

---

## Complete Release Checklist

- [ ] **Switch to production mode**: `./scripts/toggle-dev-mode.sh prod`
- [ ] Verify vendor/ has 5 .tgz files (4 sentry + 1 agent-core)
- [ ] Build runner CLI: `cd apps/runner && pnpm build`
- [ ] Bump version in `apps/runner/package.json`
- [ ] Pack CLI: `pnpm pack` (creates .tgz)
- [ ] Test locally: `npm install -g ./sentryvibe-runner-cli-X.Y.Z.tgz`
- [ ] Run test commands: `sentryvibe --version`, `sentryvibe status`
- [ ] Create git tag: `git tag runner-cli-vX.Y.Z`
- [ ] Push tag: `git push origin runner-cli-vX.Y.Z`
- [ ] Create GitHub release with .tgz file (rename to `sentryvibe-cli.tgz`)
- [ ] Test install script: `curl ... | bash`
- [ ] Optional: Publish to npm: `npm publish`
- [ ] **Switch back to dev mode**: `./scripts/toggle-dev-mode.sh dev`

---

## Environment Variables Required

After installation, users must configure:

```bash
# Create .env file (or use sentryvibe init)
ANTHROPIC_API_KEY=sk-ant-...        # Required for Claude builds
OPENAI_API_KEY=sk-...               # Required for Codex builds
DATABASE_URL=postgresql://...       # Required for persistence
RUNNER_SHARED_SECRET=your-secret    # Required for broker auth
WORKSPACE_DIR=./sentryvibe-workspace # Optional, default: ./sentryvibe-workspace
```

---

## Notes

- The CLI is designed to work **offline** after installation (vendor packages bundled)
- Templates are defined in `templates.json` (included in package)
- Postinstall script is essential - without it, Sentry instrumentation won't work
- Node 20+ required (down from 18 due to SDK requirements)
