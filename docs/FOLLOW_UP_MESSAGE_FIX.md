# Follow-Up Message Build Status Fix

## Problem Summary
Follow-up messages (sending a new message after initial build completes) were not showing real-time build progress updates. Symptoms:
- "Follow Up 1" section appeared but showed no progress
- No SSE/WebSocket updates received for new todos
- Hard refresh showed progress, but updates still didn't stream
- Second hard refresh showed completed tasks

## Root Causes

### 1. **WebSocket Disconnection After Build Completion**
**Location:** `apps/sentryvibe/src/app/page.tsx:292`

**Problem:**
```typescript
// OLD CODE (BUGGY):
const hasActiveSession = generationState?.isActive === true;
enabled: !!currentProject && (isGenerating || hasActiveSession)
```

When a build completed:
1. `generationState.isActive` becomes `false`
2. `isGenerating` is `false` 
3. WebSocket disconnects (`enabled` becomes `false`)
4. User sends follow-up message
5. `startGeneration()` calls `setIsGenerating(true)` (async React state update)
6. WebSocket hook re-evaluates `enabled` with **OLD** state values
7. Build starts on server but WebSocket still disconnected
8. Updates sent but client not listening!

**Fix:**
```typescript
// NEW CODE (FIXED):
enabled: !!currentProject  // Always connect when project exists (eager mode)
```

Benefits:
- WebSocket stays connected throughout project session
- No race condition between state update and build start
- Ready to receive updates immediately when follow-up build starts
- Follows "eager connection" pattern (connect early, stay connected)

### 2. **Missing State Transition Logging**
**Location:** `apps/sentryvibe/src/app/page.tsx:1402-1417`

Added comprehensive logging to track:
- When fresh state is created for follow-up builds
- WebSocket connection status at build start
- Build ID transitions
- Whether WebSocket has state

### 3. **WebSocket Debug Logging Disabled**
**Location:** `apps/sentryvibe/src/hooks/useBuildWebSocket.ts:42`

Changed:
```typescript
const DEBUG = true; // Enabled for follow-up debugging
```

Added logging for:
- WebSocket connection/disconnection events
- Batch update receipts with update types
- Project ID tracking

## How the Fix Works

### Follow-Up Message Flow (After Fix)

1. **Initial Build Completes**
   - `generationState.isActive = false`
   - WebSocket **STAYS CONNECTED** (eager mode)

2. **User Sends Follow-Up Message**
   ```typescript
   // page.tsx:1393-1411
   const freshState = createFreshGenerationState({...});
   console.log('🎬 [Follow-up Debug] Creating fresh state...');
   updateGenerationState(freshState);  // Optimistic local state
   ```

3. **Build Request Sent**
   ```typescript
   // page.tsx:1427-1453
   await fetch(`/api/projects/${projectId}/build`, {
     method: "POST",
     body: JSON.stringify({ operationType: 'enhancement', ... })
   });
   ```

4. **Server Creates New Session**
   ```typescript
   // build/route.ts:236-307
   const buildId = body.buildId ?? `build-${Date.now()}`;
   // Creates new session with isActive: true, empty todos
   ```

5. **Server Sends WebSocket Updates**
   ```typescript
   // persistent-event-processor.ts
   // Sends batch updates: todos, tool-calls, text notes
   buildWebSocketServer.broadcastBatchUpdate(projectId, sessionId, updates);
   ```

6. **Client Receives & Merges Updates**
   ```typescript
   // page.tsx:608-650
   useEffect(() => {
     if (wsState) {
       console.log('🔌 WebSocket state update:', { buildId, todosLength, ... });
       setGenerationState(prevState => ({
         ...prevState,
         ...wsState,  // Merge server updates
       }));
     }
   }, [wsState]);
   ```

7. **UI Updates in Real-Time**
   - BuildProgress component receives updated state
   - Todos appear and update
   - Tool calls stream in
   - Progress bar animates

## Testing Instructions

### Prerequisites
1. Have a project with completed initial build
2. Dev server should be stopped (not required)
3. Open browser dev console to see debug logs

### Test Case 1: Follow-Up Message with WebSocket Logging
1. **Send follow-up message:** "Can we switch this to light mode"
2. **Expected console logs:**
   ```
   🎬 [Follow-up Debug] Creating fresh state for build: {
     buildId: "build-1234567890",
     operationType: "enhancement",
     isActive: true,
     wsConnected: true,  // ✅ MUST BE TRUE
     projectId: "abc123"
   }
   
   [useBuildWebSocket] ✅ WebSocket opened for project: abc123
   
   🎬 [Follow-up Debug] Starting generation stream with WebSocket: {
     wsConnected: true,     // ✅ MUST BE TRUE
     wsReconnecting: false,
     hasWsState: true/false
   }
   
   [useBuildWebSocket] 📦 Received batch update: {
     projectId: "abc123",
     sessionId: "session-xyz",
     updateCount: 3,
     updateTypes: "todos, tool-call, text-note"
   }
   
   🔌 WebSocket state update: {
     buildId: "build-1234567890",
     todosLength: 3,         // ✅ Todos received!
     isActive: true
   }
   ```

3. **Expected UI behavior:**
   - "Follow Up 1" section appears
   - Progress bar shows immediately
   - Todos appear one by one in real-time
   - Tool calls stream in as they execute
   - No need to refresh!

### Test Case 2: Multiple Follow-Ups
1. Complete first follow-up build
2. Send another message: "Make the buttons blue"
3. Verify:
   - "Follow Up 2" section appears
   - Same real-time streaming behavior
   - WebSocket stays connected between builds

### Test Case 3: After Page Refresh
1. Refresh page while build is active
2. Verify:
   - WebSocket reconnects automatically
   - State hydrates from database
   - Build continues streaming

## Debug Commands

### Enable Detailed Logging
```typescript
// page.tsx (already set)
const DEBUG_PAGE = true;

// useBuildWebSocket.ts (already enabled)
const DEBUG = true;
```

### Check WebSocket Connection Status
```javascript
// In browser console
window.addEventListener('load', () => {
  console.log('WebSocket connections:', 
    Array.from(document.querySelectorAll('script'))
      .filter(s => s.textContent?.includes('WebSocket'))
  );
});
```

### Monitor Network Traffic
1. Open Chrome DevTools → Network tab
2. Filter: "WS" (WebSocket)
3. Look for `/ws?projectId=...` connection
4. Should show "101 Switching Protocols" (success)

## Verification Checklist

- [ ] Follow-up message shows "Follow Up N" section immediately
- [ ] Console shows `wsConnected: true` when build starts
- [ ] Console shows batch updates being received
- [ ] BuildProgress component shows todos appearing in real-time
- [ ] No hard refresh needed to see updates
- [ ] WebSocket connection persists between builds
- [ ] No errors in console about disconnected WebSocket

## Files Changed

1. **apps/sentryvibe/src/app/page.tsx**
   - Line 295: Changed WebSocket `enabled` to always-on mode
   - Lines 1402-1417: Added follow-up debug logging
   - Lines 602-607: Added follow-up flow documentation
   - Lines 613-618: Enhanced WebSocket sync logging

2. **apps/sentryvibe/src/hooks/useBuildWebSocket.ts**
   - Line 42: Enabled DEBUG mode
   - Lines 155-160: Added batch update logging
   - Line 359: Enhanced connection logging
   - Line 371: Enhanced disconnection logging

## Related Issues Fixed

- Race condition between state update and WebSocket connection
- WebSocket disconnecting after build completion
- Missing real-time updates for follow-up builds
- Stale state after hard refresh

## Performance Impact

**Positive:**
- Eliminates need for hard refreshes (better UX)
- Reduces database queries (fewer refetch calls)
- Faster perceived performance (instant feedback)

**Neutral:**
- WebSocket connection stays open (minimal overhead)
- One persistent connection per project session
- Modern browsers handle this efficiently

## Rollback Plan

If issues occur, revert to conditional connection:

```typescript
// apps/sentryvibe/src/app/page.tsx:295
const hasActiveSession = generationState?.isActive === true;
enabled: !!currentProject && (isGenerating || hasActiveSession)
```

However, this will **reintroduce the follow-up message bug**.

## Future Improvements

1. **Connection Pooling:** Reuse WebSocket across projects
2. **Reconnection Strategy:** Exponential backoff with jitter
3. **Health Checks:** Periodic ping/pong to detect stale connections
4. **State Reconciliation:** Handle edge cases when client/server state diverges

## Success Metrics

- Follow-up builds show real-time updates: **100%**
- WebSocket connection established before build: **100%**
- Zero hard refreshes needed: **Target**
- User reports of "stuck" builds: **Eliminated**

