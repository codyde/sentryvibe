# SentryVibe Communication Flow - Visual Guide

## 🎨 Simple Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           USER CLICKS "GENERATE"                          │
└──────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  STEP 1: Frontend (React)                                                 │
│  ─────────────────────────                                                │
│  • File: apps/sentryvibe/src/app/page.tsx                                 │
│  • Action: POST /api/projects/[id]/build                                  │
│  • Payload: { prompt, agent, operationType }                              │
└──────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  STEP 2: Next.js API Route                                                │
│  ──────────────────────────                                               │
│  • File: apps/sentryvibe/src/app/api/projects/[id]/build/route.ts        │
│  • Actions:                                                                │
│    1. Create generation_session in PostgreSQL                             │
│    2. Register with persistent-event-processor                            │
│    3. Send command to Broker (HTTP)                                       │
└──────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  STEP 3: Broker (Message Router)                                          │
│  ────────────────────────────────                                         │
│  • File: apps/broker/src/index.ts                                         │
│  • Actions:                                                                │
│    1. Receive HTTP command from Next.js                                   │
│    2. Add Sentry trace context                                            │
│    3. Forward to Runner via WebSocket                                     │
└──────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  STEP 4: Runner (Build Worker)                                            │
│  ───────────────────────────                                              │
│  • File: apps/runner/src/index.ts                                         │
│  • Actions:                                                                │
│    1. Receive command via WebSocket                                       │
│    2. handleCommand() → orchestrateBuild()                                │
│    3. createBuildStream() → Execute AI Agent                              │
│    4. Stream events back to Broker                                        │
└──────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  STEP 5: AI Agent Execution                                               │
│  ───────────────────────────                                              │
│  • Files:                                                                  │
│    - apps/runner/src/index.ts (createClaudeQuery / createCodexQuery)     │
│    - AI SDK / Codex SDK                                                   │
│  • Events Generated:                                                       │
│    - start                                                                 │
│    - tool-input-available (TodoWrite, Read, Write, Edit, etc.)           │
│    - tool-output-available                                                │
│    - text-delta                                                           │
│    - finish                                                               │
└──────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  STEP 6: Broker Forwards Events Back                                      │
│  ────────────────────────────────────                                     │
│  • File: apps/broker/src/index.ts                                         │
│  • Actions:                                                                │
│    1. Receive event from Runner (WebSocket)                               │
│    2. Forward to Next.js /api/runner/events (HTTP)                        │
└──────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  STEP 7: Persistent Event Processor                                       │
│  ───────────────────────────────────                                      │
│  • File: packages/agent-core/src/lib/runner/persistent-event-processor.ts│
│  • Actions:                                                                │
│    1. Receive event from broker                                           │
│    2. Parse event data                                                    │
│    3. Write to PostgreSQL:                                                │
│       - generation_sessions (status, metadata)                            │
│       - generation_todos (content, status, activeForm)                    │
│       - generation_tool_calls (name, input, output, timing)              │
│    4. Call refreshRawState() to fetch latest from DB                     │
│    5. Broadcast via WebSocket                                             │
└──────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  STEP 8: WebSocket Server Broadcasts                                      │
│  ─────────────────────────────────────                                    │
│  • File: packages/agent-core/src/lib/websocket/server.ts                 │
│  • Actions:                                                                │
│    1. Batch updates (200ms window)                                        │
│    2. Find all subscribed clients for project/session                    │
│    3. Send batch-update message to all clients                            │
│    4. Todos flush immediately (high priority)                             │
└──────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  STEP 9: Frontend Receives Update                                         │
│  ──────────────────────────────────                                       │
│  • File: apps/sentryvibe/src/hooks/useBuildWebSocket.ts                  │
│  • Actions:                                                                │
│    1. WebSocket onmessage handler receives batch-update                  │
│    2. processBatchUpdate() merges into React state                        │
│    3. setState() triggers React re-render                                 │
└──────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        USER SEES REAL-TIME UPDATES                        │
│                        (Todos, Tool Calls, Progress)                      │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 🔍 Detailed Event Flow (Build in Progress)

### **AI Agent Emits: "TodoWrite"**

```
┌─────────────┐
│  AI Agent   │  Emits: tool-input-available
│  (Claude)   │  Data: { toolName: "TodoWrite", input: { todos: [...] } }
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Runner    │  sendEvent() → Broker
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Broker    │  forwardEvent() → Next.js /api/runner/events
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│  Persistent Event Processor │  CRITICAL SEQUENCE:
└──────┬──────────────────────┘
       │
       ├─ 1. persistTodo() for each todo → DB INSERT
       │
       ├─ 2. persistToolCall() → DB INSERT
       │
       ├─ 3. refreshRawState() → DB SELECT (fetch latest)
       │
       ├─ 4. buildWebSocketServer.broadcastTodoUpdate()
       │
       └─ 5. Check if all todos complete → auto-finalize
              │
              ▼
┌─────────────────────┐
│  WebSocket Server   │  Batches update
└──────┬──────────────┘
       │
       ├─ Finds all clients subscribed to projectId
       │
       └─ Sends: { type: 'batch-update', updates: [...] }
              │
              ▼
┌─────────────────────┐
│  Frontend Hook      │  processBatchUpdate()
└──────┬──────────────┘
       │
       ├─ Updates React state: todos, activeTodoIndex
       │
       └─ React re-renders → User sees todo list
```

### **AI Agent Emits: "Read" (Tool Call)**

```
AI Agent → Runner → Broker → Next.js → Persistent Processor
                                              │
                                              ├─ 1. persistToolCall() → DB INSERT
                                              │    Table: generation_tool_calls
                                              │    Columns: sessionId, toolCallId, name, input, state
                                              │
                                              ├─ 2. Associate with currentActiveTodoIndex
                                              │
                                              ├─ 3. refreshRawState() → Fetch from DB
                                              │
                                              └─ 4. broadcastToolCall()
                                                     │
                                                     ▼
                                              WebSocket Server
                                                     │
                                                     └─ Batches with other updates (200ms)
                                                            │
                                                            ▼
                                                     Frontend Hook
                                                            │
                                                            └─ Merges tool call into active todo
                                                                   │
                                                                   ▼
                                                            User sees tool nested under todo
```

---

## 🗄️ Database Schema (Simplified)

### **generation_sessions**
```sql
CREATE TABLE generation_sessions (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  build_id TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'pending', 'active', 'completed', 'failed'
  agent_id TEXT,         -- 'claude-code', 'codex'
  claude_model_id TEXT,  -- 'claude-haiku-4-5', etc.
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### **generation_todos**
```sql
CREATE TABLE generation_todos (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES generation_sessions(id),
  index INTEGER NOT NULL,     -- Order in the list (0, 1, 2, ...)
  content TEXT,               -- "Set up Next.js project"
  active_form TEXT,           -- Current todo text (can change)
  status TEXT NOT NULL,       -- 'pending', 'in_progress', 'completed', 'failed'
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  
  UNIQUE(session_id, index)   -- One todo per index per session
);
```

### **generation_tool_calls**
```sql
CREATE TABLE generation_tool_calls (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES generation_sessions(id),
  tool_call_id TEXT NOT NULL,  -- AI SDK tool call ID
  todo_index INTEGER NOT NULL, -- Which todo this tool belongs to
  name TEXT NOT NULL,          -- 'Read', 'Write', 'Edit', 'Bash', etc.
  input JSONB,                 -- Tool input parameters
  output JSONB,                -- Tool output result
  state TEXT NOT NULL,         -- 'input-available', 'output-available'
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  
  UNIQUE(session_id, tool_call_id)  -- Prevent duplicates
);
```

---

## 🔄 What Happens on Page Refresh?

### **Old Architecture (SSE - BROKEN)**
```
1. User refreshes page
2. SSE connection drops
3. Frontend tries to reconnect → race condition
4. Database might have stale data
5. User sees corrupted state or stuck build
```

### **New Architecture (WebSocket + Database - WORKING)**
```
1. User refreshes page
   │
   ▼
2. Frontend loads, useBuildWebSocket initializes
   │
   ▼
3. Fetch initial state from database
   GET /api/projects/[id]/messages
   │
   ├─ Returns: generation_sessions (status, metadata)
   ├─ Returns: generation_todos (full list)
   └─ Returns: generation_tool_calls (nested under todos)
   │
   ▼
4. Display state immediately (hydration)
   │
   ▼
5. WebSocket connects (100-500ms)
   │
   ▼
6. Resume receiving real-time updates
   │
   └─ No data loss, seamless continuation
```

---

## 🎯 Key Synchronization Points

### **Point 1: Todos Before Tools**
```
Persistent Processor receives tool-input-available (TodoWrite)
  │
  ├─ 1. WAIT for all persistTodo() to complete (Promise.all)
  ├─ 2. THEN persistToolCall()
  ├─ 3. THEN refreshRawState()
  └─ 4. THEN broadcastTodoUpdate()
```

**Why?** Ensures frontend has todo structure before tools arrive. Tools must nest under correct todo.

### **Point 2: Database Before WebSocket**
```
Persistent Processor on every event:
  │
  ├─ 1. Write to PostgreSQL
  ├─ 2. refreshRawState() - SELECT from DB
  └─ 3. Broadcast via WebSocket
```

**Why?** Database is single source of truth. WebSocket is notification layer, not storage.

### **Point 3: Tool Name Preservation**
```
tool-input-available event arrives:
  ├─ Extract: toolCallId, toolName
  └─ Store in map: toolCallNameMap.set(toolCallId, toolName)

tool-output-available event arrives:
  ├─ Extract: toolCallId (no toolName!)
  └─ Lookup: toolName = toolCallNameMap.get(toolCallId)
```

**Why?** Output events don't include toolName. Must preserve from input event.

---

## 🚨 Common Failure Modes

### **Failure 1: WebSocket Disconnects Mid-Build**
**What Happens:**
- Frontend loses real-time connection
- Persistent processor continues writing to database
- Build completes successfully

**Recovery:**
- Frontend shows "Reconnecting..." indicator
- Exponential backoff (1s, 2s, 4s, 8s, 16s, 30s max)
- Max 10 attempts
- On reconnect: fetch state from database, resume updates

### **Failure 2: Next.js Server Restarts**
**What Happens:**
- All WebSocket connections drop
- Persistent processor unregistered
- Runner still processing (independent)

**Recovery:**
- Database has partial state (todos, tool calls)
- When Next.js restarts: cleanupStuckBuilds() runs
- Marks sessions older than 5 minutes as 'failed'
- Frontend refetches state, shows accurate status

### **Failure 3: Runner Crashes**
**What Happens:**
- Broker detects connection loss (heartbeat timeout)
- Persistent processor waits for events (never arrive)

**Recovery:**
- Auto-finalize: If all todos complete before crash, build marked as done
- Otherwise: Session remains 'active' until cleanupStuckBuilds()
- Frontend shows "Build failed" after timeout

---

## 📊 Performance Characteristics

### **Latency Breakdown**
```
User clicks Generate → Database write: ~50-100ms
Database write → WebSocket broadcast: ~10-20ms
WebSocket broadcast → Frontend receives: ~10-50ms
Frontend setState → UI update: ~10-20ms

Total: ~80-190ms from action to UI update
```

### **Message Volume**
```
Typical build (10 todos, 50 tool calls):
- TodoWrite events: 1-10 (depends on agent strategy)
- Tool call events: 100-200 (input + output for each)
- Text delta events: 1000-5000 (streaming LLM output)

With batching:
- WebSocket messages: 50-100 (batched every 200ms)
- Database writes: 60-70 (todos + tool calls)
```

### **Resource Usage**
```
Memory:
- WebSocket server: ~50MB (100 clients)
- Persistent processor: ~10MB per active build
- Frontend hook: ~5MB per active session

CPU:
- WebSocket batching: ~1% (background interval)
- Database writes: ~5-10% during active build
- Frontend updates: ~2-5% (React re-renders)
```

---

## 🎉 Why This Architecture Works

### **1. Resilience**
- Database survives crashes
- WebSocket auto-reconnects
- Broker retries failed events
- Persistent processor independent of frontend

### **2. Scalability**
- Multiple runners via broker
- Multiple clients via WebSocket pub/sub
- Batching reduces message overhead
- Database handles concurrent writes

### **3. Developer Experience**
- Real-time updates (no polling)
- Page refresh works seamlessly
- Multiple tabs stay in sync
- Clear separation of concerns

### **4. Observability**
- Sentry distributed tracing across services
- Database logs all events
- WebSocket stats (connections, messages)
- Debug mode for verbose logging

---

**For more details, see `COMMUNICATION_FLOW_ANALYSIS.md`**

