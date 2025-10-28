# Bug Fix: Agent Metadata Loss on Navigation

**Date**: October 27, 2025  
**Commits**: `4319075`, `69bf900`  
**Status**: ✅ Fixed - Ready for Testing

---

## 🐛 The Bug

**Symptom**: After navigating away from a building project and returning, agent info showed as undefined:

```javascript
// Bad:
{
  agentId: undefined,
  claudeModelId: undefined,
  projectName: '',
}

// Instead of:
{
  agentId: 'claude-code',
  claudeModelId: 'claude-haiku-4-5',
  projectName: 'Sentry AI Agent Monitoring',
}
```

**Impact**:
- UI showed blank agent info
- Final todos didn't update
- Progress percentage stuck below 100%
- Required hard refresh to see correct state

---

## 🔍 Root Causes Found

### Triple Bug - All Three Needed Fixing

#### Bug 1: Backend Messages Route (Hydration)
**Location**: `apps/sentryvibe/src/app/api/projects/[id]/messages/route.ts:145`

**Problem**: Fallback state construction didn't include `agentId` or `claudeModelId`

**Before**:
```typescript
if (!hydratedState) {
  hydratedState = {
    projectName: '',
    operationType: session.operationType,
    // ❌ Missing: agentId, claudeModelId
    todos,
    // ...
  };
}
```

**After**:
```typescript
// Extract metadata from rawState even if full deserialization fails
const agentId = rawStateObj?.agentId;
const claudeModelId = rawStateObj?.claudeModelId;
const projectName = rawStateObj?.projectName;

if (!hydratedState) {
  hydratedState = {
    projectName: projectName || '',
    operationType: session.operationType,
    agentId: agentId,           // ✅ Now included
    claudeModelId: claudeModelId, // ✅ Now included
    todos,
    codex: rawStateObj?.codex,  // ✅ Also added
    // ...
  };
}
```

---

#### Bug 2: Frontend Hydration (Rebuild Function)
**Location**: `apps/sentryvibe/src/app/page.tsx:731`

**Problem**: Frontend's `rebuild()` function also didn't extract agent metadata

**Before**:
```typescript
return {
  projectName: (raw.projectName as string) ?? currentProject?.name,
  operationType: (raw.operationType as BuildOperationType),
  // ❌ Missing: agentId, claudeModelId
  todos,
  // ...
};
```

**After**:
```typescript
return {
  projectName: (raw.projectName as string) ?? currentProject?.name,
  operationType: (raw.operationType as BuildOperationType),
  agentId: raw.agentId,           // ✅ Now included
  claudeModelId: raw.claudeModelId, // ✅ Now included
  todos,
  codex: raw.codex,              // ✅ Also added
  // ...
};
```

---

#### Bug 3: WebSocket State Sync Condition
**Location**: `apps/sentryvibe/src/app/page.tsx:255`

**Problem**: WebSocket sync only triggered when `wsConnected && wsState`, missing initial hydration

**Before**:
```typescript
useEffect(() => {
  if (wsConnected && wsState) {  // ❌ Requires connection
    setGenerationState(wsState);
  }
}, [wsState, wsConnected]);
```

**After**:
```typescript
useEffect(() => {
  if (wsState) {  // ✅ Sync anytime wsState changes (hydration OR updates)
    setGenerationState((prevState) => {
      // Merge to preserve metadata
      return {
        ...prevState,
        ...wsState,
        agentId: wsState.agentId || prevState?.agentId,
        // ...
      };
    });
  }
}, [wsState, wsConnected]);
```

---

#### Bug 4: Backend Snapshot (Empty Project Name)
**Location**: `packages/agent-core/src/lib/runner/persistent-event-processor.ts:148`

**Problem**: `buildSnapshot()` always set `projectName: ''`

**Before**:
```typescript
const snapshot: GenerationState = {
  projectName: '', // ❌ Always empty
  // ...
};
```

**After**:
```typescript
// Fetch project name from database
const [projectRow] = await db
  .select()
  .from(projects)
  .where(eq(projects.id, sessionRow.projectId))
  .limit(1);

const projectName = projectRow?.name || context.projectId;

const snapshot: GenerationState = {
  projectName: projectName, // ✅ Populated from DB
  // ...
};
```

---

## 🔧 What Was Fixed

### Backend Changes

1. **Messages Route** - Extracts agent metadata even when deserialization fails
2. **Persistent Processor** - Fetches projectName from database
3. **WebSocket Broadcasts** - Now include complete metadata

### Frontend Changes

1. **Hydration Logic** - Extracts agentId/claudeModelId from raw state
2. **WebSocket Sync** - Syncs on ANY state change (not just when connected)
3. **State Merging** - Preserves metadata when merging updates
4. **Debug Logging** - Shows metadata values during merge

---

## 🧪 Testing Instructions

### Test 1: Basic Navigation

1. Start a build (any agent)
2. Wait for 2-3 todos to show
3. Navigate to home page (click "Home" or project switcher)
4. Navigate back to the building project

**Expected** (with DEBUG_PAGE=true):
```javascript
// Should see in console:
🔌 WebSocket state update: {
  isConnected: true,
  agentId: 'claude-code',
  claudeModelId: 'claude-haiku-4-5',
  projectName: 'Sentry AI Agent Monitoring',
  todosLength: 5
}

   Merged state: {
  agentId: 'claude-code',
  claudeModelId: 'claude-haiku-4-5',
  projectName: 'Sentry AI Agent Monitoring'
}

🔍 [BuildHeader] Agent values: {
  agentId: 'claude-code',
  claudeModelId: 'claude-haiku-4-5',
  projectName: 'Sentry AI Agent Monitoring',
  // ...
}
```

**Should NOT see**:
```javascript
// Bad - undefined values:
{
  agentId: undefined,
  claudeModelId: undefined,
  projectName: ''
}
```

---

### Test 2: Enable Debug Mode

**Enable verbose logging** (optional):
```typescript
// apps/sentryvibe/src/app/page.tsx:89
const DEBUG_PAGE = true; // Change from false to true

// apps/sentryvibe/src/hooks/useBuildWebSocket.ts:42
const DEBUG = true; // Already enabled
```

**Watch for**:
- `[useBuildWebSocket] Hydrating state from database...`
- `[useBuildWebSocket] State hydrated successfully`
- `[useBuildWebSocket] Connecting to: ws://localhost:3000/ws?projectId=...`
- `[useBuildWebSocket] WebSocket opened`
- `[useBuildWebSocket] Message received: connected`
- `🔌 WebSocket state update: { agentId: '...', ... }`

---

### Test 3: Connection Status

**Watch for status indicator** (top-right corner):
- 🟢 **Hidden** = Connected (good, no need to show)
- 🟡 **"Reconnecting..."** = Brief yellow spinner (normal during navigation)
- 🔴 **"Connection error"** = Red alert (should NOT happen)
- ⚪ **"Disconnected"** = Gray dot (only if WebSocket fails)

---

## 🔍 About the Port 8969 Error

**The error you saw**:
```
POST http://localhost:8969/stream net::ERR_CONNECTION_REFUSED
```

**This is likely**:
- Runner's dev server trying to connect back (different issue)
- OR old SSE endpoint on different port (can ignore for now)
- NOT related to WebSocket (WebSocket uses port 3000)

**Safe to ignore** during testing unless it causes actual problems.

---

## 📊 What Should Happen Now

### When You Navigate Back

**Old Behavior** (Broken):
```
1. Navigate back
2. DB loads state WITHOUT agentId/claudeModelId
3. WebSocket connects and sends partial update
4. Frontend replaces state → metadata lost
5. UI shows undefined everywhere
```

**New Behavior** (Fixed):
```
1. Navigate back
2. DB loads state WITH agentId/claudeModelId (from rawState)
3. Frontend sets generationState with metadata
4. WebSocket connects and sends updates
5. Frontend MERGES updates, preserving metadata
6. UI shows everything correctly
```

---

## 🎯 Verification Checklist

After testing, verify:

- [ ] Agent info (Claude Code, Haiku 4.5) always visible during build
- [ ] Project name always visible (not blank)
- [ ] Final todos complete to 100%
- [ ] Progress percentage reaches 100% when done
- [ ] Chat messages appear in real-time
- [ ] No "undefined" values in BuildHeader
- [ ] WebSocket status indicator works (yellow → hidden)
- [ ] Page refresh maintains all state
- [ ] Navigation back maintains all state
- [ ] No need for hard refresh

---

## 🚀 Ready for Testing

**Commits Pushed**:
- `4319075` - WebSocket state merge
- `69bf900` - Agent metadata persistence

**Changes**: 5 files modified
- Backend: messages route + persistent processor  
- Frontend: page.tsx + useBuildWebSocket hook
- Debug: Logging enabled

**Test now with**: `pnpm dev` in apps/sentryvibe

All the metadata should stay populated throughout navigation! 🎉

