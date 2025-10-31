# Release Notes - v0.11.0

**Release Date:** October 31, 2025

## Overview

This is a **major release** featuring significant infrastructure improvements to process management, port allocation, observability, and connection reliability. This release includes comprehensive improvements to how SentryVibe manages dev server processes, allocates ports, and tracks system health.

---

## 🎯 Major Features

### 1. Process Management System Overhaul ⭐ NEW

Complete redesign of the process lifecycle management system with proper state tracking, graceful shutdown, and health monitoring.

#### **Phase 1: Critical Fixes**

**Graceful Shutdown with Fallback**
- SIGTERM → wait (10s timeout) → SIGKILL fallback
- Proper async/await handling throughout
- Coordinated tunnel cleanup before process termination
- No more orphaned tunnels or zombie processes

**Atomic Cleanup Operations**
- Tunnel closure → Process termination → DB cleanup (in order)
- All-or-nothing cleanup to prevent partial failures
- Better error handling and reporting

**Changes:**
```typescript
// Before: Immediate kill, no cleanup
devProcess.process.kill('SIGTERM');
activeProcesses.delete(projectId);

// After: Graceful with tunnel cleanup
if (tunnelManager && port) {
  await tunnelManager.closeTunnel(port);
}
devProcess.process.kill('SIGTERM');
// Wait for exit with timeout...
// Fall back to SIGKILL if needed
```

#### **Phase 2: Reliability**

**Process State Machine**
- Full lifecycle tracking: `IDLE → STARTING → RUNNING → STOPPING → STOPPED/FAILED`
- State transitions logged and tracked
- Process metadata includes: startedAt, lastHealthCheck, stopReason, failureReason

**Health Checks After Start**
- Automatic health verification after server spawn
- Port listening check + HTTP request verification
- 30-second timeout with 1-second retries
- Server marked as RUNNING only after health check passes
- Failures classified with actionable suggestions

**Enhanced Error Classification**
- 7 specific failure types:
  - `PORT_IN_USE` - Port conflict detected
  - `COMMAND_NOT_FOUND` - Missing dependencies
  - `DIRECTORY_MISSING` - Project deleted/moved
  - `PERMISSION_DENIED` - File permission issues
  - `IMMEDIATE_CRASH` - Process crashes within 3 seconds
  - `HEALTH_CHECK_TIMEOUT` - Server doesn't respond in time
  - `HEALTH_CHECK_FAILED` - Server fails to start properly
  - `UNKNOWN` - Generic errors

- Each error includes actionable suggestions
- Better debugging with failure reason tracking

**New Exports:**
```typescript
export enum ProcessState { ... }
export enum FailureReason { ... }
export async function runHealthCheck(projectId, port)
export function getProcessState(projectId)
```

**Files Changed:**
- `apps/runner/src/lib/process-manager.ts` - +280 lines of reliability improvements
- `apps/runner/src/index.ts` - Updated start-dev-server handler with health checks

**Benefits:**
- ✅ Know when servers are actually ready (not just spawned)
- ✅ Better error messages with actionable suggestions
- ✅ Track process lifecycle for debugging
- ✅ Detect port conflicts, missing dependencies, crashes immediately
- ✅ No more orphaned resources (tunnels, ports, DB entries)
- ✅ Graceful shutdown prevents data loss

---

### 2. Port and Tunnel System Overhaul (#107)

Complete redesign of the port allocation and tunnel management system for improved reliability and predictability.

**Key Improvements:**
- **Database-backed port allocation** - Replace reactive port detection with proactive allocation
- **Port availability checks** - Automatic reallocation on conflicts  
- **Port cleanup job** - Remove abandoned allocations after 7+ days of inactivity
- **Next.js CLI support** - Add `-p` flag support for Next.js port enforcement
- **Port reachability checks** - Verify port is listening before tunnel creation
- **Simplified UI** - Use `devServerPort` as single source of truth via SSE

**Port Enforcement by Framework:**
```typescript
// Vite/Astro: --port X --host 0.0.0.0 --strictPort
npm run dev -- --port 3001 --host 0.0.0.0 --strictPort

// Next.js: -p X
npm run dev -- -p 3001

// Node/Express: PORT env var
PORT=3001 npm run dev
```

**Benefits:**
- ✅ Eliminates port conflicts between projects
- ✅ UI always shows correct port (no async mismatches)
- ✅ Tunnels always connect to correct port
- ✅ Predictable port assignments (sticky to projects)
- ✅ Automatic recovery from port conflicts

**Files Changed:**
- `packages/agent-core/src/lib/port-allocator.ts` - Enhanced with availability checks
- `apps/runner/src/lib/process-manager.ts` - Simplified (removed stdout parsing)
- `apps/sentryvibe/src/app/api/projects/[id]/start-tunnel/route.ts` - Port reachability
- `apps/sentryvibe/src/app/api/projects/[id]/start/route.ts` - Port allocation
- `apps/sentryvibe/src/components/PreviewPanel.tsx` - UI updates

---

### 3. Sentry Metrics Instrumentation (#106)

Added comprehensive metrics tracking for key user interactions to improve observability.

**Metrics Added:**
- `codex.event.count` - Total events processed by runner
- `codex.tag.selected` - Tag selection tracking
- `codex.project.deleted` - Project deletion tracking  
- `codex.tunnel.started` - Tunnel creation tracking

**Integration Points:**
- Runner event processing (`apps/runner/src/index.ts`)
- Project deletion API (`apps/sentryvibe/src/app/api/projects/route.ts`)
- Tag selection UI (`apps/sentryvibe/src/components/tags/TagInput.tsx`)
- Tunnel startup flow

**Benefits:**
- 📊 Track user engagement patterns
- 🔍 Monitor system performance
- 🚨 Alert on anomalies
- 📈 Data-driven product decisions

---

## 🐛 Bug Fixes

### Fix Runner-Broker Connection Reliability (#104)

Resolved critical issues with runner-broker WebSocket connections after prolonged running periods.

**Issues Fixed:**
- ❌ Stale connections not being detected
- ❌ Reconnection logic not working after network hiccups  
- ❌ Heartbeat/ping timer conflicts
- ❌ Connection timeout not enforced

**Solutions:**
- ✅ Added `PONG_TIMEOUT` (45 seconds)
- ✅ Added `CONNECTION_HANDSHAKE_TIMEOUT` (10 seconds)
- ✅ Track `lastPongReceived` timestamp
- ✅ Improved reconnection logic with exponential backoff
- ✅ Separated ping and heartbeat timers
- ✅ Enhanced connection state tracking

---

## 📦 Package Updates

### Sentry SDK Vendor Packages

All vendor packages updated to **v10.22.0** with metrics API support:
- `@sentry/core` - 10.17.0 → 10.22.0 ✅
- `@sentry/node` - 10.17.0 → 10.22.0 ✅
- `@sentry/node-core` - 10.17.0 → 10.22.0 ✅  
- `@sentry/nextjs` - 10.17.0 → 10.22.0 ✅

**What's New:**
- ✅ Metrics API support (`Sentry.metrics.increment()`)
- ✅ Proper TypeScript type exports for metrics
- ✅ Improved error tracking
- ✅ Bug fixes from upstream Sentry SDK

**Build Process:**
- Rebuilt from `sentry-javascript` repo at version 10.22.0
- Includes latest features and fixes
- Fixed missing `metrics` export issue in vendor packages

---

## 🔧 Technical Improvements

### Process Management
- **State machine** for process lifecycle tracking
- **Health checks** after server start (port + HTTP verification)
- **Error classification** with actionable suggestions
- **Graceful shutdown** with SIGTERM/SIGKILL fallback
- **Atomic cleanup** operations (tunnel + process + DB)

### Port Allocation System
- Port assignments now sticky to projects (stored in database)
- Automatic conflict resolution with port reallocation
- Framework-specific port enforcement (Vite, Astro, Next.js, Node)
- Cleanup job removes stale allocations (7+ day threshold)
- Port reachability verification before tunnel creation

### Connection Reliability
- Heartbeat and ping separation for better detection
- Connection handshake timeout enforcement
- Exponential backoff on reconnection
- Better logging for connection state changes

### UI/UX
- Preview panel shows correct port immediately (no race conditions)
- Removed client-side `terminalPort` prop (single source of truth)
- Better loading states during tunnel creation
- Health status feedback to users

---

## 📊 Commits Included

```
4d0dfac - Merge feat/process-management-improvements into main
2f99ebc - feat: Implement Phase 1 process management improvements
c496728 - feat: Implement Phase 2 process management improvements
e9ceb01 - Port and Tunnel System Overhaul (#107)
ec3222e - Add Sentry metrics instrumentation for user interactions (#106)
2ed6ec8 - Fix runner broker connection reliability issues after prolonged running (#104)
```

---

## 🚀 Upgrade Instructions

### For Local Development

```bash
# Pull latest
git pull origin main

# Reinstall dependencies (vendor packages updated to 10.22.0)
pnpm install

# Rebuild all packages
pnpm build:all

# Restart services
sentryvibe start
```

### For Production (Railway)

The deployment will automatically:
1. Use updated vendor packages (10.22.0)
2. Run database migrations (no schema changes)
3. Apply new port allocation logic
4. Enable process state tracking
5. Enable health checks

**No manual intervention required** - all changes are backward compatible.

---

## 🔍 Testing Checklist

- [x] Port allocation works correctly for new projects
- [x] Existing projects can start without port conflicts  
- [x] Health checks pass for started servers
- [x] Graceful shutdown closes tunnels properly
- [x] SIGTERM/SIGKILL fallback works
- [x] Error messages are actionable and helpful
- [x] Tunnels connect to correct ports
- [x] Metrics are being sent to Sentry
- [x] Runner-broker connections remain stable
- [x] Next.js projects respect port allocation (-p flag)
- [x] Vite/Astro projects use `--strictPort`
- [x] Process states transition correctly
- [x] Failed processes report meaningful errors

---

## 📝 Breaking Changes

**None** - All changes are backward compatible.

Existing projects will continue to work without modification. The new features activate automatically on the next server start.

---

## 🎓 What This Means For Users

### Better Reliability
- Servers start successfully more often (health checks catch issues early)
- No more "tunnel connected to wrong port" errors
- Stopping a server properly cleans up all resources

### Better Error Messages
Instead of generic errors, you now get:
```
❌ Port 3001 is already in use
   Suggestion: Another process is using this port. Stop it or the system will reallocate.
```

### Better Observability
- Sentry metrics track system usage
- Process states visible in logs
- Health check status reported
- Failure reasons classified

### Smoother Operation
- Graceful shutdown (processes have time to save state)
- Atomic cleanup (no partial failures)
- Automatic port conflict resolution
- Health verification before marking server as "ready"

---

## 🙏 Contributors

- @codyde - All features, fixes, and improvements

---

## 🔗 Links

- **GitHub Release:** https://github.com/codyde/sentryvibe/releases/tag/v0.11.0
- **Full Changelog:** https://github.com/codyde/sentryvibe/compare/v0.10.4...v0.11.0
- **PR #107:** https://github.com/codyde/sentryvibe/pull/107 (Port/Tunnel Overhaul)
- **PR #106:** https://github.com/codyde/sentryvibe/pull/106 (Sentry Metrics)
- **PR #104:** https://github.com/codyde/sentryvibe/pull/104 (Connection Reliability)
- **Analysis Doc:** `PROCESS_MANAGEMENT_ANALYSIS.md` (Implementation guide)

---

## 📚 Additional Documentation

See `PROCESS_MANAGEMENT_ANALYSIS.md` for detailed technical analysis of the process management improvements, including:
- Problem identification
- Solution design
- Implementation phases
- Future enhancement opportunities

