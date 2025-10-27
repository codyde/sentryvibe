# Communication Flow Analysis - SentryVibe

**Date**: October 27, 2025  
**Purpose**: Detailed analysis of request/response flow from frontend → broker → runner → database → websocket

---

## 🎯 High-Level Architecture

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Frontend  │────1───▶│   Next.js   │────2───▶│   Broker    │────3───▶│   Runner    │
│  (Browser)  │◀───9────│   Server    │◀───8────│  (WS Proxy) │◀───7────│  (Worker)   │
└─────────────┘         └─────────────┘         └─────────────┘         └─────────────┘
                              │ ▲                                              │ ▲
                              │ │                                              │ │
                           4  │ │ 6                                         5  │ │ 5
                              ▼ │                                              ▼ │
                        ┌─────────────┐                                 ┌─────────────┐
                        │  WebSocket  │                                 │  PostgreSQL │
                        │   Server    │                                 │  Database   │
                        └─────────────┘                                 └─────────────┘
```

**Key Components**:
1. **Frontend** (React/Next.js) - User interface and state management
2. **Next.js Server** (apps/sentryvibe) - API routes and WebSocket server
3. **Broker** (apps/broker) - Message router between Next.js and Runner
4. **Runner** (apps/runner) - Build execution and AI agent orchestration
5. **Database** (PostgreSQL) - Single source of truth for all state
6. **WebSocket** (embedded in Next.js) - Real-time updates to frontend

---

## 📊 Complete Request Flow (Build Execution)

### **Step 1: User Initiates Build** 
**Location**: `apps/sentryvibe/src/app/page.tsx:2733-2850`

User types a prompt and clicks "Generate" or "Regenerate"

```typescript
// Frontend submits build request
const response = await fetch(`/api/projects/${projectId}/build`, {
  method: 'POST',
  body: JSON.stringify({
    prompt: "Build a React app",
    operationType: "initial-build",
    agent: "claude-code",
    claudeModel: "claude-haiku-4-5"
  })
});
```

---

### **Step 2: Next.js API Route Processes Request**
**Location**: `apps/sentryvibe/src/app/api/projects/[id]/build/route.ts:62-522`

**Key Actions**:
1. **Validates** project exists in database
2. **Creates** generation session in database
3. **Registers** build with persistent event processor
4. **Sends** command to broker
5. **Returns** SSE stream to frontend (legacy, still active)

```typescript
// Create session in database
const sessionResult = await db.insert(generationSessions).values({
  id: sessionId,
  projectId: id,
  buildId: buildId,
  status: 'pending',
  agentId: agentId,
  claudeModelId: claudeModel
}).returning();

// Register with persistent processor (subscribes to events)
const cleanup = registerBuild(commandId, sessionId, id, buildId, agentId, claudeModel);

// Send command to broker
await sendCommandToRunner(runnerId, {
  id: commandId,
  type: 'start-build',
  projectId: id,
  timestamp: new Date().toISOString(),
  payload: {
    operationType: body.operationType,
    prompt: body.prompt,
    projectSlug: generatedSlug,
    projectName: generatedFriendlyName,
    agent: agentId,
    claudeModel: claudeModel,
    template: templateMetadata
  }
});
```

---

### **Step 3: Broker Receives Command**
**Location**: `apps/broker/src/index.ts:114-151`

**Broker Role**: WebSocket-based message router

```typescript
// HTTP endpoint receives command from Next.js
app.post('/commands', auth, (req, res) => {
  const { runnerId = 'default', command } = req.body;
  
  const connection = connections.get(runnerId);
  if (!connection || connection.socket.readyState !== WebSocket.OPEN) {
    return res.status(503).json({ error: 'Runner not connected' });
  }
  
  // Extract Sentry trace context for distributed tracing
  const traceData = Sentry.getTraceData();
  
  // Add trace context to command payload
  const commandWithTrace = {
    ...command,
    _sentry: {
      trace: traceData['sentry-trace'],
      baggage: traceData.baggage
    }
  };
  
  // Send to runner via WebSocket
  connection.socket.send(JSON.stringify(commandWithTrace));
  return res.json({ ok: true });
});
```

---

### **Step 4: Runner Receives Command**
**Location**: `apps/runner/src/index.ts:2043-2085`

**Runner WebSocket Handler**:

```typescript
socket.on("message", (data: WebSocket.RawData) => {
  try {
    const command = JSON.parse(String(data)) as RunnerCommand;
    
    // Continue distributed trace from Next.js
    if (command._sentry?.trace) {
      Sentry.continueTrace({
        sentryTrace: command._sentry.trace,
        baggage: command._sentry.baggage
      }, async () => {
        Sentry.setTag("command_type", command.type);
        Sentry.setTag("project_id", command.projectId);
        await handleCommand(command);
      });
    } else {
      Sentry.startNewTrace(async () => {
        await handleCommand(command);
      });
    }
  } catch (error) {
    console.error("Failed to parse command", error);
  }
});
```

---

### **Step 5: Runner Executes Build**
**Location**: `apps/runner/src/index.ts:1125-1991`

**handleCommand → start-build Flow**:

```typescript
async function handleCommand(command: RunnerCommand) {
  switch (command.type) {
    case "start-build": {
      const { prompt, agent, claudeModel, template } = command.payload;
      
      // 1. Orchestrate build (template selection, context building)
      const orchestration = await orchestrateBuild({
        projectId: command.projectId,
        projectName: command.payload.projectName,
        prompt,
        operationType: command.payload.operationType,
        workingDirectory,
        agent,
        template
      });
      
      // 2. Create build stream (executes AI agent)
      const buildStream = await createBuildStream({
        prompt,
        query: buildQuery, // Claude or Codex query function
        context: orchestration.context,
        workingDirectory,
        systemPrompt: orchestration.systemPrompt,
        agent,
        projectId: command.projectId
      });
      
      // 3. Stream results back to Next.js
      const reader = buildStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        // Send to broker → Next.js via SSE
        sendEvent({
          type: 'build-stream',
          projectId: command.projectId,
          commandId: command.id,
          data: new TextDecoder().decode(value),
          timestamp: new Date().toISOString()
        });
      }
      
      // 4. Build complete
      sendEvent({
        type: 'build-completed',
        projectId: command.projectId,
        commandId: command.id,
        timestamp: new Date().toISOString()
      });
      break;
    }
  }
}
```

---

### **Step 6: AI Agent Streams Events**
**Location**: `apps/runner/src/index.ts:420-501` (Claude), `503-963` (Codex)

**AI SDK Stream Events**:
- `start` - Build begins
- `tool-input-available` - AI decides to use a tool (Read, Write, Edit, etc.)
- `tool-output-available` - Tool execution completes
- `text-delta` - AI writes text (thinking, planning)
- `finish` - Build completes

Each event is sent to broker → Next.js → persistent event processor

---

### **Step 7: Events Flow Back to Next.js**
**Location**: `apps/broker/src/index.ts:200-223` → `389-435`

**Broker Forwards Events to Next.js**:

```typescript
ws.on('message', async (data) => {
  try {
    const message = JSON.parse(data.toString()) as RunnerMessage;
    
    if (isRunnerEvent(message)) {
      const event = message as RunnerEvent;
      
      // Update heartbeat for status events
      if (event.type === 'runner-status') {
        const conn = connections.get(runnerId);
        if (conn) conn.lastHeartbeat = Date.now();
      }
      
      // Forward to Next.js /api/runner/events
      await forwardEvent(event);
    }
  } catch (error) {
    console.error('[broker] Failed to handle message', error);
  }
});

async function forwardEvent(event: RunnerEvent) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${SHARED_SECRET}`
  };
  
  // Propagate Sentry trace headers
  if (event._sentry?.trace) {
    headers['sentry-trace'] = event._sentry.trace;
    headers['baggage'] = event._sentry.baggage;
  }
  
  const response = await fetch(`${EVENT_TARGET}/api/runner/events`, {
    method: 'POST',
    headers,
    body: JSON.stringify(event)
  });
}
```

---

### **Step 8: Persistent Event Processor Writes to Database**
**Location**: `packages/agent-core/src/lib/runner/persistent-event-processor.ts:381-561`

**Critical Component**: Converts streaming events into database records

```typescript
// Registered in Step 2, listens for all events
const unsubscribe = addRunnerEventSubscriber(commandId, async (event: RunnerEvent) => {
  if (event.type === 'build-stream' && typeof event.data === 'string') {
    // Parse SSE data
    const match = event.data.match(/data:\s*({.*})/);
    if (match) {
      const eventData = JSON.parse(match[1]);
      await persistEvent(context, eventData);
    }
  }
});

async function persistEvent(context: ActiveBuildContext, eventData: any) {
  switch (eventData.type) {
    case 'start':
      // Mark session as active in DB
      await db.update(generationSessions)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(generationSessions.id, context.sessionId));
      await refreshRawState(context);
      break;
      
    case 'tool-input-available':
      // Store tool call in database
      if (eventData.toolName === 'TodoWrite') {
        // CRITICAL: Persist todos FIRST
        const todos = eventData.input?.todos || [];
        await Promise.all(todos.map((todo, index) => persistTodo(context, todo, index)));
        
        // Update active todo index
        context.currentActiveTodoIndex = todos.findIndex(t => t.status === 'in_progress');
        
        // Persist TodoWrite as tool call
        await persistToolCall(context, eventData, 'input-available');
        
        // Refresh state and broadcast via WebSocket
        await refreshRawState(context);
        buildWebSocketServer.broadcastTodoUpdate(context.projectId, context.sessionId, todos);
        
        // AUTO-FINALIZE: If all todos complete, mark build as done
        const allComplete = todos.every(t => t.status === 'completed');
        if (allComplete) {
          await finalizeSession(context, 'completed', new Date());
        }
      } else {
        // Other tools (Read, Write, Edit, etc.)
        await persistToolCall(context, eventData, 'input-available');
        await refreshRawState(context);
        buildWebSocketServer.broadcastToolCall(context.projectId, context.sessionId, {
          id: eventData.toolCallId,
          name: eventData.toolName,
          todoIndex: context.currentActiveTodoIndex,
          input: eventData.input,
          state: 'input-available'
        });
      }
      break;
      
    case 'tool-output-available':
      // Update tool call with output
      await persistToolCall(context, eventData, 'output-available');
      await refreshRawState(context);
      buildWebSocketServer.broadcastToolCall(context.projectId, context.sessionId, {
        id: eventData.toolCallId,
        name: context.toolCallNameMap.get(eventData.toolCallId) || 'unknown',
        todoIndex: context.currentActiveTodoIndex,
        state: 'output-available'
      });
      break;
  }
}
```

**Database Tables Updated**:
- `generation_sessions` - Session status, start/end times, agent metadata
- `generation_todos` - Todo list (content, status, active form)
- `generation_tool_calls` - Individual tool invocations (input, output, timing)

---

### **Step 9: WebSocket Broadcasts to Frontend**
**Location**: `packages/agent-core/src/lib/websocket/server.ts:162-285`

**Real-Time Updates via WebSocket**:

```typescript
// Called by persistent event processor after DB writes
broadcastTodoUpdate(projectId: string, sessionId: string, todos: unknown[]) {
  const key = `${projectId}-${sessionId}`;
  
  // Add to pending batch
  if (!this.pendingUpdates.has(key)) {
    this.pendingUpdates.set(key, {
      projectId,
      sessionId,
      updates: []
    });
  }
  
  const batch = this.pendingUpdates.get(key)!;
  batch.updates.push({
    type: 'todo-update',
    data: { todos },
    timestamp: Date.now()
  });
  
  // Todos are high priority - flush immediately
  this.flushBatch(key);
}

private flushBatch(key: string) {
  const batch = this.pendingUpdates.get(key);
  if (!batch || batch.updates.length === 0) return;
  
  const { projectId, sessionId, updates } = batch;
  
  // Find all clients subscribed to this project/session
  const subscribers = Array.from(this.clients.values()).filter(
    client => client.projectId === projectId && 
              (!client.sessionId || client.sessionId === sessionId)
  );
  
  // Send batched update to all subscribers
  const message = {
    type: 'batch-update',
    projectId,
    sessionId,
    updates,
    timestamp: Date.now()
  };
  
  subscribers.forEach(client => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  });
  
  this.pendingUpdates.delete(key);
}
```

**Batching Strategy**:
- **Todos**: Immediate flush (high priority)
- **Tool Calls**: Batched every 200ms (efficiency)
- **State Updates**: Batched every 200ms

---

### **Step 10: Frontend Receives WebSocket Updates**
**Location**: `apps/sentryvibe/src/hooks/useBuildWebSocket.ts:280-328`

**React Hook Processes Updates**:

```typescript
const handleMessage = (event: MessageEvent) => {
  try {
    const message = JSON.parse(event.data);
    
    switch (message.type) {
      case 'connected':
        // Initial connection confirmed
        setIsConnected(true);
        break;
        
      case 'batch-update':
        // Process multiple updates at once
        processBatchUpdate(message.updates);
        break;
        
      case 'heartbeat':
        // Keep connection alive
        break;
    }
  } catch (err) {
    console.error('Failed to process message:', err);
  }
};

const processBatchUpdate = useCallback((updates: any[]) => {
  updates.forEach(update => {
    switch (update.type) {
      case 'todo-update':
        // Update todo list in React state
        setState(prev => ({
          ...prev,
          todos: update.data.todos,
          activeTodoIndex: update.data.todos.findIndex(t => t.status === 'in_progress')
        }));
        break;
        
      case 'tool-call':
        // Add or update tool call in React state
        setState(prev => ({
          ...prev,
          toolCalls: mergeTool Call(prev.toolCalls, update.data)
        }));
        break;
        
      case 'state-update':
        // Full state refresh
        setState(prev => ({
          ...prev,
          ...update.data
        }));
        break;
    }
  });
}, []);
```

**React Re-renders**:
- Todos appear immediately
- Tool calls nested under active todo
- Build progress bar updates
- Agent metadata displayed

---

## 🔄 Data Flow Summary

### **Forward Path (User → Database)**
```
User Action
  ↓
Frontend fetch() → /api/projects/[id]/build
  ↓
Next.js API Route
  ├─ Create session in DB
  ├─ Register persistent processor
  └─ sendCommandToRunner()
      ↓
Broker HTTP → WebSocket
  ↓
Runner WebSocket Handler
  ↓
handleCommand()
  ├─ orchestrateBuild() - Template selection, context building
  ├─ createBuildStream() - AI SDK execution
  └─ Stream events back
      ↓
Persistent Event Processor
  ├─ Parses SSE events
  ├─ Writes to DB (sessions, todos, tool_calls)
  └─ Triggers refreshRawState()
```

### **Backward Path (Database → User)**
```
Persistent Event Processor writes to DB
  ↓
Calls buildWebSocketServer.broadcastXXX()
  ↓
WebSocket Server batches updates
  ↓
Flushes to all subscribed clients
  ↓
Frontend useBuildWebSocket receives batch
  ↓
processBatchUpdate() merges into React state
  ↓
React re-renders UI components
  ↓
User sees updates in real-time
```

---

## 🎯 Key Insights

### **Why This Architecture?**

1. **Database as Single Source of Truth**
   - All state stored persistently
   - Page refresh = instant state sync
   - Multiple tabs receive same updates
   - Survives server restarts

2. **WebSocket for Real-Time Updates**
   - Bi-directional communication
   - Auto-reconnection with exponential backoff
   - Batching reduces message overhead
   - Heartbeat mechanism detects dead connections

3. **Broker as Message Router**
   - Decouples Next.js from Runner
   - Enables horizontal scaling (multiple runners)
   - Sentry distributed tracing across services
   - Retry logic for failed events

4. **Persistent Event Processor**
   - Survives HTTP connection drops
   - Continues processing even if frontend disconnects
   - Auto-finalizes builds when todos complete
   - Broadcasts to WebSocket after DB writes

### **Critical Synchronization Points**

1. **TodoWrite Events**
   - Todos persisted BEFORE tools
   - State refresh BEFORE WebSocket broadcast
   - Ensures frontend has todo structure before tools arrive

2. **Tool Call Tracking**
   - `toolCallNameMap` preserves tool names across input/output events
   - `currentActiveTodoIndex` ensures tools nest under correct todo
   - Deduplication via `sessionId + toolCallId` unique constraint

3. **Build Finalization**
   - Auto-finalizes when all todos = completed
   - Handles missing `build-completed` event
   - Cleanup function prevents memory leaks

---

## 🐛 Common Issues & Debugging

### **Issue 1: Updates Not Appearing**

**Symptoms**: Frontend doesn't receive real-time updates

**Debug Steps**:
1. Check WebSocket connection status (green "Live" indicator)
2. Backend logs: Look for `[persistent-processor] ✅ Todos persisted`
3. Backend logs: Look for `[WebSocket] Flushing batch for project-xxx`
4. Frontend console: Look for `[useBuildWebSocket] Message received: batch-update`

**Common Causes**:
- WebSocket not connected (check server.ts is running)
- `isGenerating` is false (WebSocket disabled)
- No subscribers for project/session (check client connection)

### **Issue 2: Duplicate Tool Calls**

**Symptoms**: Same tool appears twice in UI

**Debug Steps**:
1. Check database: `SELECT * FROM generation_tool_calls WHERE session_id = 'xxx'`
2. Look for duplicate `tool_call_id` entries
3. Check persistent processor logs for duplicate `tool-input-available` events

**Common Causes**:
- Runner sending duplicate events
- Persistent processor registered twice
- SSE and WebSocket both updating state

### **Issue 3: Page Refresh Loses State**

**Symptoms**: State disappears on refresh

**Debug Steps**:
1. Check database: Session should have `status = 'active'`
2. Check frontend: `useBuildWebSocket` should call hydration on mount
3. Check logs: `[useBuildWebSocket] Fetching initial state from DB`

**Common Causes**:
- Database write failed (check persistent processor errors)
- Frontend not fetching from DB on mount
- WebSocket reconnection failed

---

## 📚 Related Documentation

- **`WEBSOCKET_IMPLEMENTATION.md`** - WebSocket architecture details
- **`WEBSOCKET_MIGRATION_COMPLETE.md`** - Migration from SSE
- **`BUGFIX_AGENT_METADATA.md`** - Agent metadata persistence bug
- **`RESEARCH_SSE_ISSUES.md`** - Original SSE flakiness analysis

---

## 🚀 Future Enhancements

### **Short Term**
- Remove SSE code (after WebSocket proven stable)
- Add PostgreSQL LISTEN/NOTIFY for real-time DB triggers
- Add WebSocket metrics (connection duration, message volume)

### **Long Term**
- Horizontal scaling with Redis pub/sub
- State compression (gzip large payloads)
- Selective updates (send only diffs, not full state)
- Replay on reconnect (send missed updates since last known state)

---

**End of Analysis**

