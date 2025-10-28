# Port Management Solution

## Problem Summary

The remote runner system was experiencing significant UX issues with port management:

1. **Ports stuck "in use"**: When dev servers crashed or failed to start properly, port allocations in the database weren't released, causing subsequent starts to fail
2. **No visibility into failures**: When a port was already in use at the OS level, users received no clear error messages
3. **Stale allocations**: Port allocations accumulated over time without cleanup
4. **Race conditions**: Time gap between DB reservation and actual process start allowed conflicts

## Solution Implemented

### 1. OS-Level Port Availability Checking (`port-utils.ts`)

Created comprehensive port management utilities:

- **`isPortAvailable(port)`**: Checks if a port is actually free at the OS level
- **`findProcessesOnPort(port)`**: Identifies PIDs using a specific port
- **`killProcessesOnPort(port)`**: Force-kills processes occupying a port
- **`waitForPortAvailable(port)`**: Waits with retries for a port to become free
- **`findAvailablePort(start, end)`**: Finds the next available port in a range

### 2. Enhanced Port Allocator

**Added to `port-allocator.ts`:**

- **OS-level validation**: Before reserving a port in DB, check if it's actually available
- **Force-kill option**: New `forceKillIfOccupied` parameter to automatically free ports
- **Cleanup functions**:
  - `releasePortForProject(projectId)`: Release port for a specific project
  - `cleanupStalePortAllocations()`: Remove allocations > 5 minutes old
  - `releaseAllPortAllocations()`: Bulk release (used at runner startup)

### 3. Process Lifecycle Integration

**Automatic port cleanup on:**

- **Process exit**: When dev server exits (gracefully or crash), port is released via API
- **Explicit stop**: When user stops a dev server, port is released immediately
- **Runner startup**: All port allocations are cleared on runner start
- **Periodic cleanup**: Every 5 minutes, stale allocations are checked and freed

**Updated files:**
- `apps/sentryvibe/src/app/api/runner/process/[projectId]/route.ts` - Release on process deletion
- `apps/sentryvibe/src/app/api/projects/[id]/stop/route.ts` - Release on explicit stop
- `apps/sentryvibe/src/app/api/projects/[id]/start/route.ts` - Release before starting new instance

### 4. Periodic Cleanup Task

**In `apps/runner/src/index.ts`:**
- Runs every 5 minutes
- Checks allocations older than 5 minutes
- Verifies if port is actually free at OS level
- Releases stale allocations automatically

### 5. Improved Error Messages

**Enhanced `projects/[id]/start/route.ts`:**
- Detects port conflicts (EADDRINUSE)
- Provides user-friendly error messages
- Suggests remediation steps

## Usage

### For Users

**Port conflicts are now handled automatically:**

1. When starting a dev server, the system:
   - Releases any stale port allocation for the project
   - Checks port availability at OS level
   - Auto-retries if framework picks alternative port

2. Periodic cleanup runs every 5 minutes automatically

3. Clear error messages when conflicts occur

### For Developers

**Manual port cleanup (programmatically):**

```typescript
import { killProcessesOnPort, findProcessesOnPort } from '@sentryvibe/agent-core/lib/port-utils';

// Find what's using port 3000
const pids = await findProcessesOnPort(3000);
console.log('PIDs on port 3000:', pids);

// Force-kill processes on port 3000
await killProcessesOnPort(3000);
```

**Clean up all port allocations:**

```typescript
import { releaseAllPortAllocations } from '@sentryvibe/agent-core/lib/port-allocator';

const released = await releaseAllPortAllocations();
console.log(`Released ${released} port allocations`);
```

**Check port availability:**

```typescript
import { isPortAvailable } from '@sentryvibe/agent-core/lib/port-utils';

const available = await isPortAvailable(3000);
console.log('Port 3000 available:', available);
```

## Architecture Changes

### Before
```
1. Reserve port in DB
2. Start dev server
3. Hope port is available
4. If process exits → port allocation stays in DB ❌
```

### After
```
1. Release any existing allocation for project
2. Check OS-level port availability
3. Reserve port in DB (with force-kill option)
4. Start dev server
5. On exit → cleanup triggers automatically ✅
   - API receives process deletion
   - Port allocation released
6. Background: Periodic cleanup every 5min
```

## Testing

### Test Scenarios

1. **Start → Stop → Start**: Port should be properly released and reusable
2. **Start → Crash → Start**: Port should be cleaned up after crash
3. **Multiple rapid starts**: Stale allocations shouldn't block new starts
4. **Port already in use**: Clear error message, auto-retry on alternative port
5. **Runner restart**: All allocations cleaned on startup

### Manual Testing

```bash
# Test port availability check
node -e "import('@sentryvibe/agent-core/lib/port-utils').then(m => m.isPortAvailable(3000).then(console.log))"

# Test process detection on port
lsof -ti:3000  # macOS/Linux

# Test cleanup
node -e "import('@sentryvibe/agent-core/lib/port-allocator').then(m => m.cleanupStalePortAllocations().then(console.log))"
```

## Benefits

1. **Better UX**: Users no longer need to manually clean up ports
2. **Automatic recovery**: System self-heals from port conflicts
3. **Clear errors**: When issues occur, users know what's wrong
4. **Robust**: Handles edge cases (crashes, race conditions, zombie processes)
5. **Maintainable**: Centralized port management logic

## Future Enhancements

Potential improvements:

1. **Dashboard view**: Show active port allocations in UI
2. **Port preferences**: Let users specify preferred port ranges per project
3. **Health checks**: Verify dev servers are actually running on claimed ports
4. **Metrics**: Track port allocation/release patterns
5. **CLI command**: Add `sentryvibe port-cleanup` command for manual intervention

## Related Files

**Core utilities:**
- `packages/agent-core/src/lib/port-utils.ts` - OS-level port operations
- `packages/agent-core/src/lib/port-allocator.ts` - DB-level port management
- `packages/agent-core/src/lib/startup-cleanup.ts` - Startup cleanup logic

**Integration points:**
- `apps/runner/src/index.ts` - Periodic cleanup task
- `apps/sentryvibe/src/app/api/runner/process/[projectId]/route.ts` - Process deletion
- `apps/sentryvibe/src/app/api/projects/[id]/start/route.ts` - Start with cleanup
- `apps/sentryvibe/src/app/api/projects/[id]/stop/route.ts` - Stop with cleanup

## Troubleshooting

### Ports still showing as in use

1. Check runner logs for cleanup messages
2. Manually run cleanup: call `cleanupStalePortAllocations()`
3. Restart runner (forces full cleanup)

### Process won't start despite free port

1. Check project path exists
2. Verify run command is correct
3. Check runner logs for actual error
4. Look for error message in project UI

### Database allocations out of sync

1. Runner startup automatically clears all allocations
2. Periodic cleanup runs every 5 minutes
3. Manual: call `releaseAllPortAllocations()` via admin API or node console

