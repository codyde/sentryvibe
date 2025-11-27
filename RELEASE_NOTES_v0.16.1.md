# SentryVibe v0.16.1 - Railway Runner Support

**Release Date:** November 27, 2025
**Previous Version:** v0.16.0
**Type:** Patch Release (Railway deployment + bug fixes)

---

## 🎉 Overview

This patch release enables deploying SentryVibe runners as Railway services with persistent storage, allowing 24/7 runner availability without requiring local machines to be running. Also includes important bug fixes for delete operations and build reliability.

---

## ✨ Major Features

### 1. **Railway Runner Deployment Support**

Deploy runners as Railway services with full production support:

- **HTTP Health Endpoints** - `/health` and `/ready` endpoints for Railway health checks
- **Railway-Aware Configuration** - Auto-detects Railway environment via `RAILWAY_REPLICA_ID`
- **Persistent Volume Support** - Workspace storage at `/data/workspace`
- **Graceful Shutdown** - Proper SIGTERM handling with 30-second grace period
- **Service Mode Detection** - Automatically disables TUI, enables JSON logging
- **Startup Validation** - Fails fast if required configuration is missing

**New Files:**
- `apps/runner/Dockerfile` - Production Dockerfile with git, cloudflared, and Claude Code CLI
- `apps/runner/railway.toml` - Railway service configuration
- `docs/RAILWAY_RUNNER_DEPLOYMENT.md` - Comprehensive 586-line deployment guide
- `docs/RAILWAY_QUICK_START.md` - 5-minute quick start guide
- `railway.runner.example.json` - Configuration template

**Cost:** ~$10/month per runner (compute + 10GB volume)

---

## 🐛 Bug Fixes

### Delete Operations
- **Fixed delete toast accuracy** - Toast now shows actual deletion result instead of user's selection
- **Added result differentiation** - Different messages for:
  - Files successfully deleted
  - Files kept (user choice)
  - Files kept (runner offline)

### Railway Dockerfile Improvements
- **Fixed missing git** - Template cloning now works
- **Fixed missing Claude Code CLI** - AI builds now work
- **Fixed Claude Code initialization** - Created ~/.claude config directory
- **Fixed vendor file copying** - Sentry packages load correctly
- **Fixed tsconfig.base.json** - TypeScript builds succeed
- **Fixed source code ordering** - Prepare scripts run successfully

### TypeScript Fixes
- **Fixed Express type conflicts** - Proper HTTP Server typing
- **Fixed health endpoint types** - Request/Response types resolved
- **Upgraded to Express v5.1.0** - Latest stable version

### CLI Fixes
- **Fixed missing jsonc-parser** - Required dependency for ai-sdk-provider-claude-code

---

## 📦 Dependencies Added

- `express@^5.1.0` - HTTP health endpoint server (service mode only)
- `@types/express@^4.17.21` - TypeScript definitions
- `jsonc-parser@^3.3.1` - Required by ai-sdk-provider-claude-code

**Impact:** ~5MB additional container size in Railway deployments. Zero impact on local CLI usage.

---

## 🔧 Technical Details

### Runner Enhancements

**Environment Variable Support:**
```env
RUNNER_ID               # Unique identifier (uses RAILWAY_REPLICA_ID)
WORKSPACE_ROOT          # Persistent volume mount path
HEALTH_PORT             # Health check endpoint port (default: 8080)
NODE_ENV                # Enables service mode when "production"
RAILWAY_ENVIRONMENT     # Auto-detected Railway environment
```

**Health Endpoints:**
```
GET /health  → 200 OK with status details
GET /ready   → 200 OK when ready, 503 when not ready
```

**Graceful Shutdown Sequence:**
1. SIGTERM received
2. Close WebSocket connection
3. Close HTTP health server
4. Stop all dev servers
5. Close all tunnels
6. Flush Sentry events
7. Exit

---

## 📊 Stats

- **15 commits** since v0.16.0
- **11 files modified**
- **+870 lines** (mostly docs and Dockerfile)
- **Deployment guides:** 2 comprehensive documents

---

## 🚀 Upgrade Guide

### For Local CLI Users

No changes required. Pull and continue:

```bash
git pull origin main
pnpm install  # Only if you want the latest deps
```

### For Railway Deployment

Follow the new deployment guide:

1. **Read:** [RAILWAY_QUICK_START.md](./docs/RAILWAY_QUICK_START.md)
2. **Deploy:** Create runner service with volume
3. **Configure:** Set 8 environment variables
4. **Verify:** Check health endpoint and UI

Full docs: [RAILWAY_RUNNER_DEPLOYMENT.md](./docs/RAILWAY_RUNNER_DEPLOYMENT.md)

---

## 🔍 Breaking Changes

**None.** This is a backward-compatible release.

- Local CLI behavior unchanged
- Existing runners continue working
- Railway deployment is optional

---

## 📝 Full Changelog

See all commits: [v0.16.0...v0.16.1](https://github.com/codyde/sentryvibe/compare/v0.16.0...v0.16.1)

Key commits:
- `4e6135c` - Railway deployment support
- `e4e5093` - Claude Code CLI installation
- `989ca96` - Git installation for template cloning
- `aa66bf1` - Accurate delete toast messages

---

## 🙏 Next Steps

After deploying to Railway:

1. Monitor first build to ensure Claude Code CLI works
2. Check workspace persistence across restarts
3. Consider deploying multiple runners for redundancy
4. Set up Sentry monitoring for runner health

---

**Enjoy your 24/7 Railway runners!** 🚂
