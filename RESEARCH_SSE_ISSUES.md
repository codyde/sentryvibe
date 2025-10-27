# Research: SSE Stream Flakiness & Data Corruption Issues

**Date**: October 27, 2025  
**Status**: Analysis Complete - Recommendations Included

## Executive Summary

Your SSE (Server-Sent Events) implementation is experiencing data corruption and build interruptions due to a complex, multi-layered architecture with several race conditions and synchronization issues. The root causes are:

1. **Fetch-based SSE** (not EventSource) - connection loss on page refresh/navigation
2. **Dual state management** - frontend React state + backend database state
3. **Tool call duplication** - same tool appearing as "pending" and "complete"
4. **Race conditions** - SSE stream hydration vs. persistent processor updates
5. **No reconnection logic** - lost connections cannot resume

---

## Current Architecture Analysis

### 1. SSE Stream Flow

```
User initiates build
  ↓
Frontend: page.tsx `handleSubmit()`
  ↓
POST /api/projects/[id]/build
  ↓
Backend: build/route.ts
  ├─ Registers with persistent-event-processor
  ├─ Sends start-build command to runner
  └─ Returns SSE stream (ReadableStream)
      ↓
Frontend: getReader() + while(true) loop
  ├─ Parses SSE events
  ├─ Updates React state (setGenerationState)
  └─ Loop breaks on connection loss/refresh
```

**Critical Finding**: You're using `fetch().body.getReader()` instead of `EventSource`. This means:
- ❌ No automatic reconnection
- ❌ Connection lost on page refresh
- ❌ Navigation breaks the stream
- ❌ No built-in Last-Event-ID resume logic

---

### 2. Data Flow - Dual State Management

#### Frontend State (React)
```typescript
// apps/sentryvibe/src/app/page.tsx:117-118
const [generationState, setGenerationState] = useState<GenerationState | null>(null);
const generationStateRef = useRef<GenerationState | null>(generationState);
```

- Lives in browser memory
- Updated on every SSE event
- **Lost on page refresh/navigation**
- Must be "hydrated" from database on reconnect

#### Backend State (Database)
```typescript
// packages/agent-core/src/lib/runner/persistent-event-processor.ts
// Persists to PostgreSQL tables:
- generationSessions (build metadata)
- generationTodos (todo list items)
- generationToolCalls (tool call records)
- generationNotes (text messages)
```

**The Problem**: These two states can diverge when:
1. SSE connection is lost (page refresh)
2. Events arrive during hydration
3. Persistent processor is still writing while frontend reads

---

### 3. Tool Call Duplication Issue

#### Database Schema
```typescript
// packages/agent-core/src/lib/db/schema.ts:112-113
toolCallUnique: uniqueIndex('generation_tool_calls_call_id_unique')
  .on(table.sessionId, table.toolCallId),
```

The unique constraint **should** prevent duplicates, but you're seeing them. Why?

#### Event Flow Analysis

```
Runner sends: tool-input-available
  ↓
persistent-event-processor (line 396-439):
  ├─ Stores toolName in Map (line 398)
  ├─ Persists to DB with state='input-available' (line 292-315)
  └─ Uses onConflictDoUpdate (line 305)

Runner sends: tool-output-available  
  ↓
persistent-event-processor (line 446-460):
  ├─ Tries to restore toolName from Map (line 450-456)
  ├─ Updates DB with state='output-available'
  └─ If toolName missing, tries to find existing record (line 251-278)
```

**Duplication Sources**:

1. **Codex Adapter Issues** (`apps/runner/src/lib/codex-sdk-adapter.ts`):
   - `item.started` event creates tool call (line 374-500)
   - `item.completed` event should match by `toolId` (line 510-899)
   - **BUT**: Tool IDs are generated inconsistently:
     - Line 82-89: Multiple fallback strategies for extracting tool ID
     - Line 83: Uses `Date.now()` as fallback - can collide!
     ```typescript
     function getToolId(item: CodexThreadEvent['item']): string {
       if (!item) return `tool-${Date.now()}`; // 🚨 COLLISION RISK
       // ... tries various fields
       return `tool-${Date.now()}`; // 🚨 FALLBACK
     }
     ```

2. **Frontend State Updates** (`apps/sentryvibe/src/app/page.tsx:1377-1533`):
   - Receives `tool-input-available` → creates tool in `toolsByTodo` (line 1463-1532)
   - Receives `tool-output-available` → finds and updates tool (line 1538-1586)
   - **BUT**: If hydration happens between input/output events:
     - Frontend has stale state
     - Database has the truth
     - Mismatch causes duplicates in UI

3. **Hydration Race Condition** (`apps/sentryvibe/src/app/page.tsx:587-778`):
   ```typescript
   // line 600-629: Rebuilds toolsByTodo from database
   const toolsByTodo: Record<number, ToolCall[]> = {};
   if (raw.toolsByTodo) {
     Object.entries(raw.toolsByTodo as Record<string, unknown[]>)
       .forEach(([key, tools]) => {
         // Maps database records back to frontend state
       });
   }
   ```
   - Hydration reads `rawState` JSONB from database (line 602)
   - Persistent processor is **still writing** to database concurrently
   - Frontend might read a partially-updated state

---

### 4. Page Refresh Behavior

When user refreshes the page:

```
1. ❌ SSE stream connection is LOST
   └─ fetch() with getReader() cannot reconnect

2. ✅ Persistent processor CONTINUES running
   └─ Still subscribed to runner events (line 566-589)
   └─ Still writing to database

3. 🔄 Frontend tries to HYDRATE (line 587-778)
   └─ Loads latest session from `/api/projects/[id]/messages`
   └─ Rebuilds generationState from rawState JSONB

4. 🐛 RACE CONDITION
   └─ If hydration reads while persistent processor writes
   └─ State is incomplete or corrupted
```

**Evidence in Code**:
```typescript
// apps/sentryvibe/src/app/page.tsx:786-812
useEffect(() => {
  if (selectedProjectSlug) {
    // ... 
    if (isGeneratingRef.current) {
      console.log("⚠️ Generation in progress - keeping existing generationState");
      return; // Tries to protect against race
    }
    // But this check is NOT sufficient!
  }
}, [selectedProjectSlug, /* ... */]);
```

The `isGeneratingRef.current` check only protects against **frontend** generation state, not **backend** persistent processor still running.

---

### 5. Codex-Specific Issues

For Codex (OpenAI) agent, you have additional complexity:

```typescript
// apps/runner/src/lib/codex-sdk-adapter.ts:346-948
export async function* transformCodexStream(
  stream: AsyncIterable<any>
): AsyncGenerator<TransformedMessage, void, unknown> {
  // ...
  const inProgressTools = new Map<string, {...}>();
  // Line 354-358: Tracks tool state across events
  
  for await (const event of stream) {
    switch (event.type) {
      case 'item.started':
        // Emits tool-use message immediately (line 392-407)
        inProgressTools.set(toolId, { /* ... */ });
        
      case 'item.completed':
        // Should find matching tool in Map (line 519-539)
        const toolInfo = inProgressTools.get(toolId);
        if (!toolInfo) {
          // 🚨 WARNING: Emits duplicate tool call! (line 523-538)
        }
    }
  }
}
```

**Problem**: If `item.completed` arrives without matching `item.started`:
- Adapter emits a **new** tool call (line 525-538)
- Then emits the tool result
- Frontend sees **TWO** tool calls with same ID

---

## Root Causes Summary

| Issue | Impact | Severity |
|-------|--------|----------|
| Fetch-based SSE (no reconnect) | Lost connections on refresh | 🔴 **CRITICAL** |
| Dual state management | State divergence, race conditions | 🔴 **CRITICAL** |
| Tool ID generation with Date.now() | Collisions under load | 🟡 **MEDIUM** |
| Hydration race condition | Incomplete/corrupted state | 🔴 **CRITICAL** |
| Codex adapter emits duplicates | Duplicate tool calls in UI | 🟠 **HIGH** |
| No SSE resume logic | Can't continue after disconnect | 🔴 **CRITICAL** |

---

## Proposed Solutions

### Option A: Database + WebSocket (RECOMMENDED)

**Architecture**:
```
Agent writes → Database (source of truth)
    ↓
Backend polls/watches DB
    ↓
WebSocket broadcasts updates → All connected clients
```

**Benefits**:
- ✅ Database is **single source of truth**
- ✅ WebSocket auto-reconnects
- ✅ Multiple clients can watch same build
- ✅ Page refresh = instant state sync
- ✅ No race conditions (read from DB)

**Implementation**:
```typescript
// New: apps/sentryvibe/src/app/api/projects/[id]/ws/route.ts
export async function GET(req: Request) {
  const { socket, response } = Deno.upgradeWebSocket(req);
  
  socket.onopen = () => {
    // Subscribe to database changes
    const subscription = supabase
      .channel(`project:${projectId}`)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'generation_sessions' },
        (payload) => {
          socket.send(JSON.stringify(payload));
        }
      )
      .subscribe();
  };
  
  return response;
}
```

**Changes Required**:
1. Replace SSE streams with WebSocket
2. Runner writes **directly to database** (remove SSE intermediary)
3. Frontend subscribes to WebSocket for updates
4. Remove `generationState` React state - read from DB only

**Pros**:
- Clean separation of concerns
- Solves all race conditions
- Resilient to disconnects
- Scalable (multiple clients)

**Cons**:
- Moderate refactoring effort
- Need WebSocket infrastructure
- Database becomes hot path

---

### Option B: Persistent SSE with Resume Token

**Architecture**:
```
Frontend loses connection
    ↓
Reconnects with Last-Event-ID header
    ↓
Backend resends events since last ID
```

**Implementation**:
```typescript
// Frontend: apps/sentryvibe/src/app/page.tsx
const eventSource = new EventSource(
  `/api/projects/${projectId}/build-stream?lastEventId=${lastEventId}`
);

eventSource.addEventListener('message', (e) => {
  lastEventId = e.lastEventId; // Track for reconnect
  // Process event
});

eventSource.onerror = () => {
  // EventSource auto-reconnects with Last-Event-ID header
};
```

**Backend**:
```typescript
// apps/sentryvibe/src/app/api/projects/[id]/build-stream/route.ts
export async function GET(req: Request) {
  const lastEventId = req.headers.get('Last-Event-ID');
  
  // Replay events from database since lastEventId
  const missedEvents = await db
    .select()
    .from(eventLog)
    .where(gt(eventLog.id, lastEventId));
    
  for (const event of missedEvents) {
    sendSSE(event);
  }
  
  // Then stream new events...
}
```

**Pros**:
- Minimal refactoring
- Built-in reconnection
- Standard EventSource API

**Cons**:
- Still have dual state (frontend + backend)
- Must log ALL events to database
- Replay logic complexity
- Doesn't solve tool duplication

---

### Option C: Simplified SSE + Polling Fallback

**Architecture**:
```
Primary: SSE stream (fast updates)
Fallback: Poll /api/projects/[id]/state every 2s
```

**Implementation**:
```typescript
// Frontend
const [isSSEConnected, setIsSSEConnected] = useState(false);

// SSE for real-time updates
const eventSource = new EventSource(url);
eventSource.onmessage = (e) => {
  setIsSSEConnected(true);
  updateState(e.data);
};
eventSource.onerror = () => {
  setIsSSEConnected(false);
};

// Polling fallback
useEffect(() => {
  if (!isSSEConnected) {
    const interval = setInterval(async () => {
      const state = await fetch(`/api/projects/${projectId}/state`).then(r => r.json());
      updateState(state);
    }, 2000);
    return () => clearInterval(interval);
  }
}, [isSSEConnected]);
```

**Pros**:
- Simple to implement
- Resilient to disconnects
- SSE for performance, polling for reliability

**Cons**:
- Higher server load (polling)
- 2s delay on reconnect
- Still have race conditions

---

## Immediate Fixes (Band-Aids)

While architecting a long-term solution, these will reduce issues:

### 1. Fix Tool ID Generation
```typescript
// apps/runner/src/lib/codex-sdk-adapter.ts:82-89
function getToolId(item: CodexThreadEvent['item']): string {
  if (!item) return `tool-${randomUUID()}`; // Use UUID instead of Date.now()
  
  // Try actual IDs first
  const candidates = ['id', 'tool_call_id', 'item_id'];
  for (const key of candidates) {
    const value = item[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  
  return `tool-${randomUUID()}`; // UUID for fallback
}
```

### 2. Prevent Hydration During Active Builds
```typescript
// apps/sentryvibe/src/app/page.tsx:786
useEffect(() => {
  if (selectedProjectSlug) {
    // Check if persistent processor is still running
    const activeBuilds = await fetch('/api/runner/active-builds').then(r => r.json());
    const isBackendActive = activeBuilds.some(b => b.projectId === projectId);
    
    if (isGeneratingRef.current || isBackendActive) {
      console.log("⚠️ Build active - deferring hydration");
      return;
    }
    
    // Safe to hydrate
    loadMessages(project.id);
  }
}, [selectedProjectSlug]);
```

### 3. Deduplicate Tools in UI
```typescript
// apps/sentryvibe/src/app/page.tsx:1499
const existing = baseState.toolsByTodo[activeIndex] || [];

// Check for duplicate before adding
const isDuplicate = existing.some(t => 
  t.id === tool.id || 
  (t.name === tool.name && t.state === 'input-available')
);

if (!isDuplicate) {
  const updated = {
    ...baseState,
    toolsByTodo: {
      ...baseState.toolsByTodo,
      [activeIndex]: [...existing, tool],
    },
  };
}
```

### 4. Add SSE Reconnection Logic
```typescript
// Replace getReader() with EventSource in page.tsx
const connectSSE = (lastEventId?: string) => {
  const url = lastEventId 
    ? `/api/projects/${projectId}/build?lastEventId=${lastEventId}`
    : `/api/projects/${projectId}/build`;
    
  const eventSource = new EventSource(url);
  
  eventSource.addEventListener('message', (e) => {
    lastEventId = e.lastEventId;
    processEvent(JSON.parse(e.data));
  });
  
  eventSource.addEventListener('error', () => {
    console.log('SSE disconnected, reconnecting...');
    eventSource.close();
    setTimeout(() => connectSSE(lastEventId), 1000);
  });
};
```

---

## Recommendation: Go with Option A (Database + WebSocket)

**Why**:
1. Eliminates dual state management (database is truth)
2. WebSocket handles reconnection automatically
3. Solves all race conditions (read from DB)
4. Clean architecture (separation of concerns)
5. Scalable (multiple clients can watch)

**Migration Path**:
1. **Phase 1**: Keep SSE, add WebSocket alongside for state updates
2. **Phase 2**: Move agent output to write directly to DB
3. **Phase 3**: Remove SSE, use WebSocket for everything
4. **Phase 4**: Clean up frontend state (remove generationState)

**Estimated Effort**: 2-3 days

---

## Questions for Discussion

1. Do you want **real-time streaming** (character-by-character), or is **batch updates** (every 100ms) acceptable?
   - Real-time → WebSocket
   - Batch → Polling might be simpler

2. Do you need **multiple clients** to watch the same build?
   - Yes → WebSocket is essential
   - No → Polling could work

3. What's your **deployment environment**?
   - Railway/Render/etc → Check WebSocket support
   - Vercel → WebSocket limitations (use Pusher/Ably)

4. How important is **character-by-character streaming** for text?
   - Very → Keep streaming architecture
   - Not critical → Batch updates simplify everything

---

## Files to Review

**High Priority**:
1. `apps/sentryvibe/src/app/page.tsx` (lines 1200-1700) - SSE consumption
2. `apps/sentryvibe/src/app/api/projects/[id]/build/route.ts` - SSE production
3. `packages/agent-core/src/lib/runner/persistent-event-processor.ts` - DB persistence
4. `apps/runner/src/lib/codex-sdk-adapter.ts` (lines 82-90, 510-540) - Tool ID issues

**Medium Priority**:
5. `packages/agent-core/src/lib/db/schema.ts` - Database schema
6. `apps/sentryvibe/src/components/BuildProgress/index.tsx` - UI rendering
7. `apps/runner/src/lib/message-transformer.ts` - SSE transformation

---

## Next Steps

1. **Decide on architecture**: WebSocket vs. SSE vs. Polling
2. **Apply immediate fixes**: Tool ID generation, deduplication
3. **Plan migration**: Phase 1-4 if going with WebSocket
4. **Test thoroughly**: Focus on page refresh, navigation, concurrent builds

Let me know which direction you want to go, and I can help implement the solution! 🚀

