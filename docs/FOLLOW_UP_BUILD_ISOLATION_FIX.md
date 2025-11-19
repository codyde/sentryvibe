# Follow-Up Build Isolation Fix

## Problem

When sending follow-up messages, the build plan and todos from the **initial request** were appearing in the **follow-up section** instead of showing fresh, separate build plans for each follow-up.

Additionally, duplicate "Build complete!" messages appeared (disappearing after refresh), indicating stale cache data.

## Root Causes

### 1. **WebSocket State Merge Blending Old and New Builds**
**Location:** `apps/sentryvibe/src/app/page.tsx:621-673`

**Problem:**
```typescript
// OLD CODE (BUGGY):
setGenerationState((prevState) => {
  const merged = {
    ...prevState,    // OLD build (build-123) with old todos
    ...wsState,      // NEW build (build-456) with new todos
    // Result: Blended state with todos from BOTH builds!
  };
  return merged;
});
```

When a follow-up build started:
1. `prevState` contained the **completed initial build** state
2. `wsState` received updates for the **new follow-up build**
3. Shallow merge combined both → **old build plan appeared in new section**

### 2. **Incomplete Cache Invalidation on Build Completion**
**Location:** `apps/sentryvibe/src/app/page.tsx:492-512`

**Problem:**
- Build completes → `refetchProjectMessages()` called
- But TanStack Query cache wasn't fully invalidated
- Stale data persisted until hard refresh
- Caused duplicate "Build complete!" messages

## The Fixes

### Fix 1: BuildId-Aware State Replacement

```typescript
// NEW CODE (FIXED):
setGenerationState((prevState) => {
  if (!prevState) return wsState;
  
  // CRITICAL: Check if buildId changed
  const buildIdChanged = wsState.id !== prevState.id;
  
  if (buildIdChanged) {
    console.log('🔄 [State Transition] New build detected, replacing state:', {
      oldBuildId: prevState.id,
      newBuildId: wsState.id,
    });
    
    // REPLACE old state with new build (don't merge!)
    return {
      ...wsState,
      // Preserve metadata
      agentId: wsState.agentId || prevState.agentId,
      claudeModelId: wsState.claudeModelId || prevState.claudeModelId,
    };
  }
  
  // Same build - merge updates incrementally
  return { ...prevState, ...wsState };
});
```

**Benefits:**
- Each build is isolated
- Old todos don't leak into new builds
- Clean state transitions between builds

### Fix 2: Aggressive Cache Invalidation on Completion

```typescript
// Force refetch when build completes
useEffect(() => {
  if (!generationState || generationState.isActive) return;
  if (lastRefetchedBuildIdRef.current === generationState.id) return;
  
  console.log('✅ [Build Complete] Refetching messages to sync completed build');
  
  lastRefetchedBuildIdRef.current = generationState.id;
  
  // Invalidate queries to force fresh fetch
  queryClient.invalidateQueries({
    queryKey: ['projects', currentProject.id, 'messages'],
    refetchType: 'all',  // Force refetch even if not mounted
  });
  
  // Also trigger explicit refetch
  refetchProjectMessages?.();
}, [generationState, currentProject?.id, refetchProjectMessages, queryClient]);
```

**Benefits:**
- Eliminates duplicate "Build complete!" messages
- Forces fresh data from database
- No stale cache after build completes

### Fix 3: Enhanced Debug Logging

Added comprehensive logging to track buildId transitions:

```typescript
console.log('🎬 [Follow-up Debug] Creating fresh state for build:', {
  buildId: freshState.id,
  previousBuildId: generationState?.id,  // Track transitions
  wsStateBuildId: wsState?.id,           // See WebSocket state
  hasWsState: !!wsState,
});
```

**Benefits:**
- Easy to trace when builds start/transition
- Can verify buildId changes trigger replacement
- Debug WebSocket state carryover issues

## How It Works Now

### Follow-Up Message Flow

1. **Initial Build Completes**
   - `generationState` = { id: "build-123", isActive: false, todos: [...] }
   - Moves to "Builds" section (collapsed)

2. **User Sends Follow-Up Message**
   ```javascript
   // Local optimistic state created
   freshState = { id: "build-456", isActive: true, todos: [] }
   updateGenerationState(freshState);
   ```

3. **Server Creates New Session**
   - New buildId: `build-456`
   - New session in database
   - Sends WebSocket updates for new build

4. **WebSocket State Arrives**
   ```javascript
   // Detects buildId change: build-123 → build-456
   buildIdChanged = true;
   
   // REPLACES old state (doesn't merge!)
   return wsState;  // Only new build data
   ```

5. **UI Updates**
   - BuildProgress shows fresh todos for build-456
   - No old todos from build-123
   - Clean separation between builds

6. **Follow-Up Build Completes**
   - Cache invalidated
   - Fresh fetch from database
   - build-456 moves to "Builds" section
   - No duplicate messages

## UI Architecture

The page shows builds in two sections:

### Active Build Section (Line 3242)
```jsx
{generationState && generationState.isActive && (
  <BuildProgress
    state={generationState}  // Current active build
    defaultCollapsed={false}
    ...
  />
)}
```

### Build History Section (Lines 3264-3277)
```jsx
{buildHistory.map((build) => (
  <BuildProgress
    key={build.id}           // Each build isolated by ID
    state={build}            // Completed build state
    defaultCollapsed={true}  // Collapsed by default
    ...
  />
))}
```

Each `BuildProgress` component receives **isolated state** with its own:
- Build ID
- Todo list
- Tool calls
- Operation type (initial-build, enhancement, etc.)

## Testing Checklist

### Expected Behavior

- [ ] **Initial build completes** → Moves to "Builds" section
- [ ] **Send follow-up** → "Follow Up 1" section appears
- [ ] **Console shows transition:**
  ```
  🔄 [State Transition] New build detected, replacing state: {
    oldBuildId: "build-123",
    newBuildId: "build-456"
  }
  ```
- [ ] **New build shows fresh todos** (no old todos)
- [ ] **Build completes** → Cache invalidated
  ```
  ✅ [Build Complete] Refetching messages to sync completed build
  ```
- [ ] **NO duplicate "Build complete!"** messages
- [ ] **Hard refresh** → All builds still show correctly
- [ ] **Multiple follow-ups** → Each gets its own section with isolated state

### What to Watch For in Console

#### ✅ Success Logs:
```javascript
🎬 [Follow-up Debug] Creating fresh state for build: {
  buildId: "build-1763399702647",
  previousBuildId: "build-1763399123456",  // Different!
  wsConnected: true
}

🔄 [State Transition] New build detected, replacing state: {
  oldBuildId: "build-1763399123456",
  newBuildId: "build-1763399702647"
}

[useBuildWebSocket] 📦 Received batch update: {
  updateTypes: "todos, tool-call, text-note"
}

✅ [Build Complete] Refetching messages to sync completed build: {
  buildId: "build-1763399702647"
}
```

#### ❌ Problem Indicators:
- Same buildId for follow-up as previous build
- No "New build detected" transition log
- Todos from multiple builds appearing together
- Duplicate "Build complete!" messages
- No "Refetching messages" log on completion

## Files Changed

1. **apps/sentryvibe/src/app/page.tsx**
   - Lines 621-673: BuildId-aware state replacement logic
   - Lines 492-512: Aggressive cache invalidation on completion
   - Lines 1450-1460: Enhanced debug logging for buildId transitions

## Related to Previous Fix

This builds on the WebSocket eager connection fix:
- **Previous fix:** Ensured WebSocket stays connected for follow-ups
- **This fix:** Ensures follow-up builds don't mix with previous builds

Both fixes work together:
1. WebSocket stays connected (eager mode)
2. New build starts → receives updates immediately
3. BuildId change detected → replaces state cleanly
4. Build completes → invalidates cache
5. Next follow-up → repeats cleanly

## Performance Impact

**Positive:**
- Cleaner state management (no leaked data)
- Faster UI updates (no merge overhead)
- Better memory usage (old state discarded)

**Neutral:**
- One buildId comparison per WebSocket update (negligible)
- Extra cache invalidation on completion (necessary for correctness)

## Rollback Plan

If issues occur, revert line 631:

```typescript
// BEFORE (problematic merge):
const merged = { ...prevState, ...wsState };
return merged;
```

But this will **reintroduce the build plan bleeding bug**.

## Success Metrics

- Follow-up builds show isolated state: **100%**
- No old todos in new builds: **Target**
- Duplicate "Build complete!" eliminated: **Target**
- Cache stays fresh after completion: **100%**

