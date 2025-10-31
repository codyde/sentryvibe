# Process Management Analysis & Solutions

## Current Issues

### 1. **Stop Process Issues**
```typescript
// Current implementation (process-manager.ts:166-175)
export function stopDevServer(projectId: string): boolean {
  const devProcess = activeProcesses.get(projectId);
  if (!devProcess) return false;
  
  devProcess.process.kill('SIGTERM');
  activeProcesses.delete(projectId);  // ❌ IMMEDIATE deletion
  return true;
}
```

**Problems:**
- ❌ No tunnel cleanup before killing process
- ❌ Deletes from map immediately (doesn't wait for exit event)
- ❌ No timeout for graceful shutdown
- ❌ No fallback to SIGKILL if SIGTERM fails
- ❌ No state tracking (stopping vs stopped)
- ❌ Doesn't notify API of process exit

### 2. **Start Process Issues**

**Problems:**
- ❌ No health check after spawn (just assumes success)
- ❌ No timeout for server readiness
- ❌ Unclear error messages (fails silently)
- ❌ No state machine (starting → running → stopping → stopped)
- ❌ Race condition: API might mark as "running" before server is actually ready

### 3. **Tunnel/Process Lifecycle Coupling**

**Problems:**
- ❌ Tunnel can exist without process (orphaned tunnels)
- ❌ Process can die without closing tunnel
- ❌ No atomic cleanup operation
- ❌ Stop command doesn't handle tunnel cleanup

### 4. **Error Reporting**

**Problems:**
- ❌ Generic error messages ("Failed to start dev server")
- ❌ No distinction between:
  - Port conflict
  - Command not found
  - Working directory missing
  - Process crashed immediately
  - Health check timeout

## Proposed Solutions

### Solution 1: Process State Machine

```typescript
enum ProcessState {
  IDLE = 'idle',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  FAILED = 'failed'
}

interface ProcessInfo {
  projectId: string;
  process: ChildProcess;
  port: number;
  tunnelUrl?: string;
  state: ProcessState;
  emitter: EventEmitter;
  startedAt: Date;
  lastHealthCheck?: Date;
  stopReason?: string;
}
```

### Solution 2: Graceful Stop with Timeout

```typescript
async function stopDevServer(projectId: string, options?: {
  timeout?: number;
  reason?: string;
}): Promise<boolean> {
  const { timeout = 10000, reason = 'manual' } = options || {};
  
  const processInfo = activeProcesses.get(projectId);
  if (!processInfo) return false;
  
  // 1. Mark as stopping
  processInfo.state = ProcessState.STOPPING;
  processInfo.stopReason = reason;
  
  // 2. Close tunnel first (if exists)
  if (processInfo.tunnelUrl) {
    await tunnelManager.closeTunnel(processInfo.port);
    processInfo.tunnelUrl = undefined;
  }
  
  // 3. Send SIGTERM for graceful shutdown
  processInfo.process.kill('SIGTERM');
  
  // 4. Wait for exit with timeout
  const exitPromise = new Promise<void>((resolve) => {
    processInfo.emitter.once('exit', () => resolve());
  });
  
  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => resolve(), timeout);
  });
  
  await Promise.race([exitPromise, timeoutPromise]);
  
  // 5. Force kill if still running
  if (processInfo.process.exitCode === null) {
    console.warn(`Process ${projectId} didn't exit gracefully, sending SIGKILL`);
    processInfo.process.kill('SIGKILL');
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for kill
  }
  
  // 6. Cleanup
  activeProcesses.delete(projectId);
  processInfo.state = ProcessState.STOPPED;
  
  return true;
}
```

### Solution 3: Health Check After Start

```typescript
async function verifyServerHealth(port: number, maxAttempts = 30): Promise<{
  healthy: boolean;
  error?: string;
}> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Try to connect to the port
      const isListening = await checkPortAvailability(port);
      if (!isListening) {
        // Port is free, but we want it to be in use!
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      
      // Try HTTP request to verify it's responding
      try {
        const response = await fetch(`http://localhost:${port}`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(2000)
        });
        return { healthy: true };
      } catch {
        // Server is listening but not responding yet
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
    } catch (error) {
      return { 
        healthy: false, 
        error: `Health check failed: ${error.message}` 
      };
    }
  }
  
  return { 
    healthy: false, 
    error: 'Server failed to become healthy within 30 seconds' 
  };
}
```

### Solution 4: Enhanced Error Classification

```typescript
enum FailureReason {
  PORT_IN_USE = 'port_in_use',
  COMMAND_NOT_FOUND = 'command_not_found',
  DIRECTORY_MISSING = 'directory_missing',
  PERMISSION_DENIED = 'permission_denied',
  IMMEDIATE_CRASH = 'immediate_crash',
  HEALTH_CHECK_TIMEOUT = 'health_check_timeout',
  HEALTH_CHECK_FAILED = 'health_check_failed',
  UNKNOWN = 'unknown'
}

function classifyStartupError(error: unknown, processInfo: ProcessInfo): {
  reason: FailureReason;
  message: string;
  suggestion: string;
} {
  const errorStr = String(error);
  
  if (errorStr.includes('EADDRINUSE')) {
    return {
      reason: FailureReason.PORT_IN_USE,
      message: `Port ${processInfo.port} is already in use`,
      suggestion: 'Another process is using this port. Stop it or let the system reallocate.'
    };
  }
  
  if (errorStr.includes('ENOENT') || errorStr.includes('command not found')) {
    return {
      reason: FailureReason.COMMAND_NOT_FOUND,
      message: `Command not found: ${processInfo.command}`,
      suggestion: 'Check that dependencies are installed (npm install, pnpm install, etc.)'
    };
  }
  
  if (errorStr.includes('EACCES') || errorStr.includes('permission denied')) {
    return {
      reason: FailureReason.PERMISSION_DENIED,
      message: 'Permission denied',
      suggestion: 'Check file permissions and ownership'
    };
  }
  
  if (!existsSync(processInfo.cwd)) {
    return {
      reason: FailureReason.DIRECTORY_MISSING,
      message: `Working directory does not exist: ${processInfo.cwd}`,
      suggestion: 'Project may have been deleted or moved'
    };
  }
  
  // If process exited within 3 seconds of starting
  if (Date.now() - processInfo.startedAt.getTime() < 3000) {
    return {
      reason: FailureReason.IMMEDIATE_CRASH,
      message: 'Process crashed immediately after starting',
      suggestion: 'Check logs for syntax errors or missing dependencies'
    };
  }
  
  return {
    reason: FailureReason.UNKNOWN,
    message: errorStr,
    suggestion: 'Check the logs for more details'
  };
}
```

### Solution 5: Atomic Operations

```typescript
// Ensure cleanup always happens together
async function cleanupProject(projectId: string): Promise<void> {
  const processInfo = activeProcesses.get(projectId);
  if (!processInfo) return;
  
  // Group all cleanup operations
  const operations = [
    // 1. Close tunnel
    processInfo.tunnelUrl 
      ? tunnelManager.closeTunnel(processInfo.port) 
      : Promise.resolve(),
    
    // 2. Release port allocation
    releasePortForProject(projectId),
    
    // 3. Update database
    db.update(projects)
      .set({
        devServerStatus: 'stopped',
        devServerPort: null,
        tunnelUrl: null,
        devServerPid: null
      })
      .where(eq(projects.id, projectId))
  ];
  
  // Execute all in parallel, don't fail if one fails
  await Promise.allSettled(operations);
}
```

### Solution 6: Stop Command Enhancement

```typescript
case "stop-dev-server": {
  try {
    const stopped = await stopDevServer(command.projectId, {
      timeout: 10000,
      reason: 'manual'
    });
    
    if (!stopped) {
      sendEvent({
        type: "error",
        ...buildEventBase(command.projectId, command.id),
        error: "No running dev server found for project",
      });
    } else {
      // Perform atomic cleanup
      await cleanupProject(command.projectId);
      
      sendEvent({
        type: "dev-server-stopped",
        ...buildEventBase(command.projectId, command.id),
      });
    }
  } catch (error) {
    sendEvent({
      type: "error",
      ...buildEventBase(command.projectId, command.id),
      error: error instanceof Error ? error.message : "Failed to stop dev server",
    });
  }
  break;
}
```

## Implementation Priority

### Phase 1: Critical Fixes (Do First)
1. ✅ **Fix stop process** - Add tunnel cleanup before kill
2. ✅ **Add graceful shutdown** - SIGTERM with timeout → SIGKILL fallback
3. ✅ **Atomic cleanup** - Ensure tunnel + port + DB always cleaned together

### Phase 2: Reliability (Do Second)
4. **Add health checks** - Verify server is actually responding
5. **Enhanced error classification** - Better error messages
6. **State machine** - Track process states properly

### Phase 3: Monitoring (Do Third)
7. **Periodic health checks** - Detect zombie processes
8. **Auto-restart on crash** - Optional recovery
9. **Metrics collection** - Track failure rates

## Testing Scenarios

### Happy Path
- ✅ Start server → health check passes → tunnel created
- ✅ Stop server → tunnel closed → process killed → DB updated

### Edge Cases
- ✅ Start with port conflict → auto-reallocate
- ✅ Process crashes immediately → clear error message
- ✅ Stop while starting → cancel gracefully
- ✅ Kill -9 externally → detect and cleanup
- ✅ Network issues → timeout and report clearly
- ✅ Tunnel creation fails → retry or clear error

## Decisions Made

1. **Should we auto-restart crashed servers?**
   - ❌ **NO** - Don't auto-restart. Let crashes surface as errors.

2. **What's the right health check?**
   - ✅ Check port is listening
   - ✅ Make HTTP HEAD request to verify responding
   - Framework-specific timeouts (Next.js: 15s, Vite: 5s, default: 10s)

3. **Should we kill child processes?**
   - ✅ **YES** - Kill the entire process group, not just main PID
   - Use negative PID to kill group: `process.kill(-pid, 'SIGTERM')`

4. **How to handle zombie processes?**
   - ✅ Runner restart should detect and cleanup zombies
   - Check for orphaned processes on startup
   - No periodic health checks (keep it simple)

5. **Should stop be synchronous?**
   - ✅ Make it awaitable, return success/failure
   - API can wait for confirmation

## Breaking Changes

None - all improvements are backward compatible.

## Next Steps

1. Review this analysis
2. Prioritize which fixes to implement
3. Create new branch for process management improvements
4. Implement Phase 1 fixes
5. Test thoroughly
6. Deploy incrementally

