# Debug Guide - Tracing Communication Issues

## 🔍 Quick Reference for Debugging Communication Flow

---

## 🎯 "Build Not Starting" Debug Checklist

### **Step 1: Check Frontend Request**
```typescript
// File: apps/sentryvibe/src/app/page.tsx:2733-2850

// Look for this console log:
console.log('🚀 Starting build request:', { projectId, prompt, agent });

// Check Network tab in DevTools:
// - Request: POST /api/projects/[id]/build
// - Status: 200 (should return immediately)
// - Response: SSE stream (text/event-stream)
```

### **Step 2: Check API Route**
```typescript
// File: apps/sentryvibe/src/app/api/projects/[id]/build/route.ts:62-522

// Look for these logs in terminal:
[build-route] 📤 Sending template to runner: Next.js 15 Starter
[build-route]    ID: nextjs-15
[build-route]    Framework: nextjs

// If missing, check:
// 1. Project exists in database
// 2. Runner ID is valid (check getProjectRunnerId())
// 3. Database connection working
```

### **Step 3: Check Broker**
```bash
# Terminal logs for broker (port 4000):

[broker] Runner connected default
[broker] Received command: start-build for project: xxx
```

### **Step 4: Check Runner**
```bash
# Terminal logs for runner:

📥 Received command: start-build for project: xxx
  Command ID: xxx
  Build operation: initial-build
  Project slug: my-project
```

**If runner not receiving:**
- Check broker WebSocket connection: `curl http://localhost:4000/status`
- Check RUNNER_SHARED_SECRET matches between Next.js, broker, and runner

---

## 🔄 "Updates Not Appearing" Debug Path

### **Path 1: Check Persistent Processor**

```bash
# Look for these logs in Next.js terminal:

[persistent-processor] 📝 Registering build xxx
[persistent-processor] 🔧 Tool started: TodoWrite (tool-id-xxx)
[persistent-processor] ✅ Tool persisted: TodoWrite as input-available
[persistent-processor] Updated activeTodoIndex to 0
[persistent-processor] ✅ Todos persisted and state refreshed, activeTodoIndex=0
```

**If missing:**
1. Check event subscriber registered: `registerBuild()` called in build route
2. Check events arriving from runner: Enable `DEBUG_BUILD=1`
3. Check database writes succeeding: Query `generation_sessions` table

### **Path 2: Check WebSocket Broadcasting**

```bash
# Look for these logs in Next.js terminal:

[WebSocket] Client connected: client-xxx
[WebSocket] Flushing batch for project-xxx: 3 updates
```

**Enable debug mode:**
```typescript
// File: packages/agent-core/src/lib/websocket/server.ts
// Add console.log in broadcastTodoUpdate():

broadcastTodoUpdate(projectId, sessionId, todos) {
  console.log('[WebSocket] broadcastTodoUpdate called', {
    projectId,
    sessionId,
    todoCount: todos.length,
    subscriberCount: this.clients.size
  });
  // ... rest of function
}
```

### **Path 3: Check Frontend Reception**

```bash
# Browser console logs:

[useBuildWebSocket] Connecting to: ws://localhost:3000/ws?projectId=xxx
[useBuildWebSocket] WebSocket opened
[useBuildWebSocket] Message received: connected
[useBuildWebSocket] Message received: batch-update
[useBuildWebSocket] Processed 3 updates
```

**Enable debug mode:**
```typescript
// File: apps/sentryvibe/src/hooks/useBuildWebSocket.ts:42
const DEBUG = true; // Change to true
```

---

## 🛠️ "Duplicate Tool Calls" Debug Path

### **Step 1: Check Database**

```sql
-- Connect to database
psql $DATABASE_URL

-- Check for duplicates
SELECT 
  tool_call_id,
  name,
  todo_index,
  state,
  COUNT(*)
FROM generation_tool_calls
WHERE session_id = 'YOUR_SESSION_ID'
GROUP BY tool_call_id, name, todo_index, state
HAVING COUNT(*) > 1;
```

**If duplicates found:**
- Unique constraint not working: Check schema migration
- Persistent processor called twice: Check `registerBuild()` only called once
- Runner sending duplicate events: Check runner logs for double sends

### **Step 2: Check Persistent Processor Registration**

```typescript
// File: apps/sentryvibe/src/app/api/projects/[id]/build/route.ts:289-296

// Ensure this is called ONCE per build:
const cleanup = registerBuild(commandId, sessionId, id, buildId, agentId, claudeModel);

// Should see ONE log per build:
console.log('[persistent-processor] 📝 Registering build', commandId);
```

### **Step 3: Check Frontend State Merging**

```typescript
// File: apps/sentryvibe/src/hooks/useBuildWebSocket.ts

// Add debug logging in processBatchUpdate:
const processBatchUpdate = useCallback((updates: any[]) => {
  console.log('[processBatchUpdate] Processing updates:', updates.length);
  
  updates.forEach((update, index) => {
    console.log(`  Update ${index}:`, update.type, update.data);
  });
  
  // ... rest of function
}, []);
```

---

## 🗄️ Database Query Helpers

### **Check Active Sessions**
```sql
SELECT 
  id,
  project_id,
  status,
  agent_id,
  claude_model_id,
  started_at,
  ended_at
FROM generation_sessions
WHERE status = 'active'
ORDER BY started_at DESC;
```

### **Check Todos for Session**
```sql
SELECT 
  index,
  content,
  status,
  updated_at
FROM generation_todos
WHERE session_id = 'YOUR_SESSION_ID'
ORDER BY index;
```

### **Check Tool Calls for Session**
```sql
SELECT 
  tool_call_id,
  todo_index,
  name,
  state,
  started_at,
  ended_at
FROM generation_tool_calls
WHERE session_id = 'YOUR_SESSION_ID'
ORDER BY todo_index, started_at;
```

### **Check for Stuck Builds**
```sql
SELECT 
  id,
  project_id,
  status,
  started_at,
  (NOW() - started_at) AS duration
FROM generation_sessions
WHERE status = 'active'
  AND started_at < NOW() - INTERVAL '10 minutes';
```

---

## 🌐 WebSocket Connection Issues

### **Check WebSocket URL**
```typescript
// Frontend should connect to:
ws://localhost:3000/ws?projectId=xxx

// In browser console:
const ws = new WebSocket('ws://localhost:3000/ws?projectId=test');
ws.onopen = () => console.log('✅ Connected');
ws.onerror = (err) => console.error('❌ Error:', err);
ws.onmessage = (msg) => console.log('📨 Message:', msg.data);
```

### **Check Custom Server Running**
```bash
# Should see this in terminal:
> Ready on http://localhost:3000
> WebSocket server on ws://localhost:3000/ws

# If using standard Next.js (no WebSocket):
> Ready on http://localhost:3000
# (no WebSocket line)
```

### **Switch to Custom Server**
```bash
# If running pnpm dev:next (no WebSocket)
# Stop and run:
cd apps/sentryvibe
pnpm dev  # Uses custom server with WebSocket
```

---

## 🔧 Broker Debugging

### **Check Broker Status**
```bash
curl http://localhost:4000/status
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-27T...",
  "connections": [
    {
      "id": "default",
      "lastHeartbeat": "2025-10-27T...",
      "connected": true
    }
  ],
  "metrics": {
    "totalCommands": 5,
    "totalEvents": 123,
    "totalErrors": 0
  }
}
```

### **Check Broker Logs**
```bash
# Should see regular heartbeats:
[broker] Runner connected default
[broker] Received runner-status from default

# Should see commands forwarded:
[broker] Received command: start-build
[broker] Forwarding to runner: default

# Should see events forwarded:
[broker] Forwarding event: build-stream
[broker] Event forwarded successfully
```

### **Test Broker Connection**
```bash
# Send test command via curl:
curl -X POST http://localhost:4000/commands \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SHARED_SECRET" \
  -d '{
    "runnerId": "default",
    "command": {
      "id": "test-123",
      "type": "runner-health-check",
      "projectId": "test",
      "timestamp": "2025-10-27T12:00:00Z"
    }
  }'

# Expected: {"ok":true}
```

---

## 🎯 Trace Specific Event Flow

### **Scenario: Track a Single Todo Update**

**1. Enable all debug logs:**
```bash
# In terminal before starting:
export DEBUG_BUILD=1

# In code files:
# - useBuildWebSocket.ts: const DEBUG = true
# - websocket/server.ts: Add console.logs in broadcastTodoUpdate()
```

**2. Start build and watch logs:**

```bash
# Next.js Terminal:
[persistent-processor] 🔧 Tool started: TodoWrite (tool-abc123)
  ↓
[persistent-processor] ✅ Tool persisted: TodoWrite as input-available
  ↓
[persistent-processor] Updated activeTodoIndex to 0
  ↓
[persistent-processor] ✅ Todos persisted and state refreshed
  ↓
[WebSocket] broadcastTodoUpdate called
  ↓
[WebSocket] Flushing batch for project-xxx: 1 updates
  ↓
[WebSocket] Sent to 1 clients

# Browser Console:
[useBuildWebSocket] Message received: batch-update
  ↓
[useBuildWebSocket] Processing batch: 1 updates
  ↓
[useBuildWebSocket] Todo update: 3 todos
  ↓
🔌 WebSocket state update received
```

---

## 🚨 Common Error Messages & Solutions

### **Error: "Runner not connected"**
```
Status: 503
Error: Runner not connected
```

**Solutions:**
1. Start runner: `cd apps/runner && pnpm start`
2. Check broker running: `curl http://localhost:4000/status`
3. Check RUNNER_SHARED_SECRET matches
4. Check runner WebSocket connection: Look for `[broker] Runner connected`

### **Error: "RUNNER_SHARED_SECRET is required"**
```
[broker] RUNNER_SHARED_SECRET is required
Process exited with code 1
```

**Solutions:**
1. Set in broker env: `RUNNER_SHARED_SECRET=dev-secret`
2. Set in Next.js env: `RUNNER_SHARED_SECRET=dev-secret`
3. Set in runner config: Check config.json has `broker.secret`

### **Error: "Failed to send command"**
```
[broker] Failed to send command WebSocket is not open: readyState 3
```

**Solutions:**
1. Runner disconnected: Restart runner
2. Broker crashed: Restart broker
3. Network issue: Check localhost connectivity

### **Error: "WebSocket connection failed"**
```
[useBuildWebSocket] Failed to create WebSocket: Error: ...
```

**Solutions:**
1. Custom server not running: Use `pnpm dev` not `pnpm dev:next`
2. Wrong URL: Check protocol (ws:// not wss:// for localhost)
3. Port mismatch: Ensure Next.js on port 3000

### **Warning: "No subscribers for project"**
```
[WebSocket] Flushing batch for project-xxx: 0 clients
```

**Solutions:**
1. Frontend not connected: Check WebSocket status indicator
2. Wrong projectId: Check URL parameters match
3. Connection dropped: Frontend will auto-reconnect

---

## 📋 Pre-Flight Checklist

Before debugging, ensure these are running:

```bash
# 1. Database (PostgreSQL)
psql $DATABASE_URL -c "SELECT 1"  # Should return 1

# 2. Next.js Server (with custom server)
# Terminal should show: "WebSocket server on ws://localhost:3000/ws"
cd apps/sentryvibe && pnpm dev

# 3. Broker
curl http://localhost:4000/status  # Should return JSON with status: ok

# 4. Runner
# Terminal should show: "connected to broker ws://localhost:4000/socket"
cd apps/runner && pnpm start
```

---

## 🎓 Learning the Flow

### **Exercise 1: Trace a Full Build**

1. Enable all debug logs (see above)
2. Start a simple build: "Create a hello world HTML page"
3. Follow logs through:
   - Frontend POST → API route
   - API route → Broker → Runner
   - Runner → AI execution
   - Events → Persistent processor → Database
   - Database → WebSocket → Frontend
4. Time each step (should be ~80-190ms total)

### **Exercise 2: Simulate Connection Drop**

1. Start a build
2. Open DevTools → Network → Offline mode
3. Wait 10 seconds
4. Re-enable network
5. Verify:
   - "Reconnecting..." indicator appears
   - WebSocket reconnects automatically
   - State resumes from database
   - No data loss

### **Exercise 3: Multi-Tab Sync**

1. Open project in two browser tabs
2. Start build in tab 1
3. Watch tab 2 update in real-time
4. Verify both tabs show identical state

---

## 📚 Related Documentation

- **COMMUNICATION_FLOW_ANALYSIS.md** - Detailed technical flow
- **FLOW_DIAGRAM.md** - Visual diagrams
- **WEBSOCKET_IMPLEMENTATION.md** - WebSocket architecture
- **WEBSOCKET_MIGRATION_COMPLETE.md** - Migration notes

---

## 🆘 Still Stuck?

### **Collect Full Debug Output**

```bash
# 1. Enable all debug flags
export DEBUG_BUILD=1

# 2. Run each service and save logs
cd apps/sentryvibe && pnpm dev > /tmp/nextjs.log 2>&1 &
cd apps/broker && pnpm dev > /tmp/broker.log 2>&1 &
cd apps/runner && pnpm start > /tmp/runner.log 2>&1 &

# 3. Reproduce issue
# 4. Check logs
tail -f /tmp/nextjs.log
tail -f /tmp/broker.log
tail -f /tmp/runner.log
```

### **Database State Dump**

```sql
-- Save current state
\copy (SELECT * FROM generation_sessions WHERE id = 'YOUR_SESSION_ID') TO '/tmp/session.csv' CSV HEADER;
\copy (SELECT * FROM generation_todos WHERE session_id = 'YOUR_SESSION_ID') TO '/tmp/todos.csv' CSV HEADER;
\copy (SELECT * FROM generation_tool_calls WHERE session_id = 'YOUR_SESSION_ID') TO '/tmp/tools.csv' CSV HEADER;
```

### **WebSocket Message Capture**

```typescript
// In browser console:
const ws = new WebSocket('ws://localhost:3000/ws?projectId=xxx');
const messages = [];

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  messages.push({ time: Date.now(), msg });
  console.log('Message:', msg);
};

// After issue occurs:
console.log('All messages:', messages);
copy(messages); // Copies to clipboard
```

---

**Good luck debugging! 🐛🔍**

