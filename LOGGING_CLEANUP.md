# Logging Cleanup - Remove Noise

**Current problem:** Logs are EXTREMELY noisy, hard to troubleshoot

---

## 🔇 Logs to Remove/Reduce

### Client-Side (Our Code)

**Remove entirely:**
- ✅ `[messageCollection] Message inserted/updated` (success spam)
- 💾 `[messageCollection] Inserting/Updating message` (every operation)
- 📥 `[messageCollection] Fetching messages` (every refetch - too frequent!)
- ✅ `[messageCollection] Loaded X messages` (every fetch)
- `[ChatInterface] Messages updated` (every render!)
- `[ChatInterface] Loaded messages: Array(X)` (every update!)
- `[ChatInterface] Building query` (frequent)
- `[ChatInterface] Component mounted` (one-time, not useful)

**Keep only:**
- ❌ Errors (critical!)
- `[messageCollection] Initialized` (one-time, useful)
- `[INSERT #1/#2]` (temporary debugging - will remove after fix)

### Server-Side (Not Our Code, But Visible)

**Can't control but noting:**
- `[persistent-processor]` spam (background system)
- `🔗 Captured trace context` (Sentry, every tool call)
- `[API] POST /api/messages - Received` (our API, but noisy)

---

## 🎯 Action Plan

### 1. Remove Collection Success Logs

**File:** `src/collections/messageCollection.ts`

Remove:
- `console.log('💾 Inserting...')`
- `console.log('✅ Inserted...')`
- `console.log('💾 Updating...')`
- `console.log('✅ Updated...')`
- `console.log('📥 Fetching...')`
- `console.log('✅ Loaded X messages')`

Keep only:
- `console.error('❌ Failed...')` (errors)

### 2. Remove ChatInterface Update Spam

**File:** `src/components/ChatInterface.tsx`

Remove entire useEffect logging:
```typescript
useEffect(() => {
  console.log('[ChatInterface] Messages updated...');
  console.log('[ChatInterface] Loaded messages...');
}, [messagesFromDB, currentProjectId]);
```

Keep only errors if any.

### 3. Quiet API Logs

**File:** `src/app/api/messages/route.ts`

Remove:
- `console.log('[API] POST /api/messages - Received...')`
- `console.log('[API] Loaded X chat messages...')`

Keep:
- `console.error('[API] Error...')` (errors only)

### 4. Remove Query Building Logs

**File:** `src/components/ChatInterface.tsx`

Remove from useLiveQuery:
- `console.log('[ChatInterface] Building query...')`
- `console.log('[ChatInterface] Query skipped...')`

Keep only if there's an error.

---

## Result

**From:**
```
💾 Inserting...
✅ Inserted...
📥 Fetching...
✅ Loaded...
[ChatInterface] Messages updated...
[ChatInterface] Loaded messages...
[PreviewPanel] Auto-tunnel check... (not ours but visible)
```

**To:**
```
[messageCollection] Initialized
❌ Error: ... (only if something fails)
```

**Clean, quiet, only errors show!**

---

*Cleanup plan November 3, 2025*
