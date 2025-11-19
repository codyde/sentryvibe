# Manual Tracing Restoration Plan

## Executive Summary

This document provides a comprehensive analysis of how to re-add manual Sentry tracing to the SentryVibe application **without breaking existing functionality**. The key insight is that we need to **complement**, not replace, the automatic instrumentation that's already working.

---

## Current State: What Automatic Instrumentation Already Provides

### ✅ What's Working Automatically

1. **HTTP Request/Response Tracing** (via `Sentry.httpIntegration()`)
   - All Express routes in broker automatically traced
   - All Next.js API routes automatically traced
   - Outgoing HTTP calls automatically instrumented
   - Trace headers (`sentry-trace`, `baggage`) automatically propagated to `tracePropagationTargets`

2. **AI SDK Instrumentation** (via Claude/OpenAI integrations)
   - All AI model calls automatically traced
   - Token usage, latency, and errors captured
   - Works in runner and Next.js server

3. **Database Queries** (if using instrumented ORM)
   - Drizzle queries may be automatically traced

4. **WebSocket Connections**
   - ❌ **NOT automatically traced** (this is a gap!)

5. **Custom Business Logic**
   - ❌ **NOT automatically traced** (another gap!)

---

## Problem: What We Lost By Removing Manual Tracing

### Critical Gaps That Need Manual Spans

1. **Build Orchestration Flow** (`runner.build`)
   - The entire AI build process (template selection, prompt engineering, streaming) is NOT visible as a single trace
   - We lost the ability to see the full build timeline from command → completion

2. **Event Forwarding Through Broker** (`broker.forwardEvent.*`)
   - Events from runner → broker → Next.js are now disjointed
   - We can't see the full event propagation chain

3. **Database Persistence Operations** (`persistent-processor.persistEvent.*`, `persistent-processor.finalizeSession.*`)
   - Database writes for build state are invisible
   - No way to measure DB performance impact

4. **WebSocket Message Broadcasting** 
   - State updates via WebSocket are completely dark
   - Can't correlate WebSocket broadcasts with originating operations

5. **Cross-Service Correlation**
   - Without manual trace propagation via `_sentry` payloads, we can't link:
     - Runner build → Broker forward → Next.js API → Database write → WebSocket broadcast → Frontend update

---

## Solution: Strategic Manual Tracing Layer

### Design Principles

1. **Complement, Don't Replace**: Add manual spans ONLY where automatic instrumentation doesn't reach
2. **Minimal Overhead**: Only trace business-critical operations
3. **Preserve Functionality**: Never break existing behavior
4. **Optional Propagation**: Manual trace context should be optional—apps work without it

---

## Implementation Plan

### Phase 1: Core Build Flow (Highest Value)

**Goal**: Restore visibility into the AI build orchestration

#### 1.1 Runner: Wrap `start-build` Command Handler

**File**: `apps/runner/src/index.ts`

**Change**: Wrap the build orchestration in a span (ONLY for builds, not dev server commands)

```typescript
case "start-build": {
  // Wrap ONLY the build orchestration in a span
  await Sentry.startSpan(
    {
      name: "runner.build",
      op: "ai.build",
      attributes: {
        "build.project_id": command.projectId,
        "build.operation": command.payload?.operationType,
        "build.agent": command.payload?.agent,
        "build.template": command.payload?.template?.name,
      },
    },
    async () => {
      try {
        // Existing build logic here...
        
        // At the end, send build-completed event
        // This event will inherit the trace context automatically
        sendEvent({
          type: "build-completed",
          ...buildEventBase(command.projectId, command.id),
          payload: { todos: [], summary: "Build completed", detectedFramework },
        });
      } catch (error) {
        sendEvent({
          type: "build-failed",
          ...buildEventBase(command.projectId, command.id),
          error: error instanceof Error ? error.message : "Failed to run build",
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error; // Re-throw to mark span as failed
      }
    }
  );
  break;
}
```

**Why This Works**:
- The span wraps the ENTIRE build process
- When `sendEvent()` is called inside the span, Sentry automatically captures the active trace context
- No need to manually extract trace headers—they're already in scope

#### 1.2 Broker: Propagate Trace via WebSocket → HTTP

**File**: `apps/broker/src/index.ts`

**Problem**: WebSocket messages don't carry HTTP headers, so automatic trace propagation fails

**Solution**: Manually extract trace context and add to event payload

```typescript
wss.on('connection', (ws, request) => {
  // ...existing connection setup...

  ws.on('message', async (data: WebSocket.RawData) => {
    try {
      const event = JSON.parse(String(data)) as RunnerEvent;

      // Option A: If there's an active span (unlikely on WebSocket), capture it
      const activeSpan = Sentry.getActiveSpan();
      if (activeSpan) {
        const traceData = Sentry.getTraceData();
        event._sentry = {
          trace: traceData['sentry-trace'],
          baggage: traceData.baggage,
        };
      }
      // Option B: Extract from WebSocket initial handshake (if available)
      // This is more complex and may not be worth it

      // Forward event to Next.js API
      await forwardEvent(event);
    } catch (error) {
      Sentry.captureException(error);
    }
  });
});
```

**Better Alternative**: Use HTTP for critical events

```typescript
// In broker's forwardEvent function
async function forwardEvent(event: RunnerEvent) {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SHARED_SECRET}`,
    };

    // If event has trace context from runner, add it as HTTP headers
    if (event._sentry?.trace) {
      headers['sentry-trace'] = event._sentry.trace;
      headers['baggage'] = event._sentry.baggage || '';
    }

    const response = await fetch(`${EVENT_TARGET}/api/runner/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify(event),
    });

    // ... error handling ...
  } catch (error) {
    Sentry.captureException(error);
  }
}
```

**Why This Works**:
- Broker extracts trace context from runner event payload
- Converts it to HTTP headers for Next.js
- Next.js automatic instrumentation picks up the headers and continues the trace

#### 1.3 Next.js API: Continue Trace from Headers

**File**: `apps/sentryvibe/src/app/api/runner/events/route.ts`

**Change**: The automatic HTTP instrumentation already handles this! But we can add a span for the DB write:

```typescript
export async function POST(request: Request) {
  try {
    if (!ensureAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const event = (await request.json()) as RunnerEvent;

    if (!event.projectId) {
      return NextResponse.json({ ok: true });
    }

    // Automatic HTTP instrumentation already created a span for this request
    // We just need to add a child span for the DB write
    await Sentry.startSpan(
      {
        name: `api.runner.events.process.${event.type}`,
        op: 'db.update',
        attributes: {
          'event.type': event.type,
          'event.projectId': event.projectId,
        },
      },
      async () => {
        // Publish to SSE stream
        publishRunnerEvent(event);

        // Update database based on event type
        switch (event.type) {
          case 'tunnel-created': {
            await db.update(projects)
              .set({ tunnelUrl: event.tunnelUrl, lastActivityAt: new Date() })
              .where(eq(projects.id, event.projectId));
            break;
          }
          // ... other cases ...
        }
      }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error processing runner event:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

---

### Phase 2: Database Persistence (Medium Value)

**Goal**: Measure database performance impact during builds

#### 2.1 Persistent Event Processor: Wrap DB Operations

**File**: `packages/agent-core/src/lib/runner/persistent-event-processor.ts`

**Change**: Wrap `persistEvent` and `finalizeSession` in spans

```typescript
const unsubscribe = addRunnerEventSubscriber(commandId, async (event: RunnerEvent) => {
  try {
    if (event.type === 'build-stream' && typeof event.data === 'string') {
      const match = event.data.match(/data:\s*({.*})/);
      if (match) {
        const eventData = JSON.parse(match[1]);
        
        // Wrap in span to measure DB write performance
        await Sentry.startSpan(
          {
            name: `persistent-processor.persistEvent.${eventData.type}`,
            op: 'db.write',
            attributes: {
              'event.type': eventData.type,
              'event.projectId': context.projectId,
            },
          },
          async () => {
            await persistEvent(context, eventData);
          }
        );
      }
    } else if (event.type === 'build-completed') {
      await Sentry.startSpan(
        {
          name: 'persistent-processor.finalizeSession.completed',
          op: 'db.finalize',
          attributes: {
            'event.projectId': context.projectId,
            'session.status': 'completed',
          },
        },
        async () => {
          await finalizeSession(context, 'completed', new Date());
        }
      );
      cleanupBuild(commandId);
    }
    // ... similar for build-failed ...
  } catch (error) {
    console.error('[persistent-processor] Error:', error);
  }
});
```

**Why This Adds Value**:
- Shows how much time is spent in DB writes vs AI processing
- Helps identify slow queries or contention
- Provides DB-level observability

---

### Phase 3: WebSocket Broadcasting (Low Value, Optional)

**Goal**: Link WebSocket broadcasts back to originating operations

**Problem**: WebSocket broadcasts are fire-and-forget and don't have trace context

**Solution**: Add optional trace context to WebSocket messages

#### 3.1 Add Trace Context to WebSocket Messages

**File**: `packages/agent-core/src/lib/websocket/server.ts`

```typescript
broadcastStateUpdate(
  projectId: string,
  sessionId: string,
  state: Partial<GenerationState>
) {
  const key = `${projectId}-${sessionId}`;
  
  if (!this.pendingUpdates.has(key)) {
    this.pendingUpdates.set(key, { projectId, sessionId, updates: [] });
  }

  const batch = this.pendingUpdates.get(key)!;
  
  // OPTIONAL: Capture current trace context if available
  const activeSpan = Sentry.getActiveSpan();
  const traceContext = activeSpan ? {
    trace: Sentry.getTraceData()['sentry-trace'],
    baggage: Sentry.getTraceData().baggage,
  } : undefined;
  
  batch.updates.push({
    type: 'state-update',
    data: state,
    timestamp: Date.now(),
    _sentry: traceContext, // Optional - won't break if missing
  });
}
```

**Frontend**: Extract trace context from WebSocket messages (optional)

```typescript
// apps/sentryvibe/src/hooks/useBuildWebSocket.ts
const processBatchUpdate = useCallback((message: WebSocketMessage) => {
  const updates = message.updates;
  if (!updates || !Array.isArray(updates)) return;
  
  // OPTIONAL: Extract trace context for debugging
  const latestTraceContext = updates
    .reverse()
    .find(u => u._sentry)?._sentry || null;
  
  if (latestTraceContext) {
    console.debug('[WebSocket] Trace context:', latestTraceContext);
    // Could potentially use this for frontend -> backend API calls
  }
  
  // Process updates...
}, []);
```

---

## Type Definitions

### Add `_sentry` Field Back to Message Types (Optional)

**File**: `packages/agent-core/src/shared/runner/messages.ts`

```typescript
export interface BaseEvent {
  type: RunnerEventType;
  commandId?: string;
  projectId?: string;
  timestamp: string;
  _sentry?: {
    trace?: string;
    baggage?: string;
  };
}

export interface BaseCommand {
  id: string;
  type: RunnerCommandType;
  projectId: string;
  timestamp: string;
  _sentry?: {
    trace?: string;
    baggage?: string;
  };
}
```

**Important**: Make these fields **optional** so the app works without them.

---

## Testing Strategy

### 1. Verify Automatic Instrumentation Still Works

```bash
# 1. Start all services
npm run dev:all

# 2. Create a new project and check Sentry
# - Should see HTTP traces for API calls
# - Should see AI model calls
# - Should NOT see custom spans yet
```

### 2. Add Manual Spans Incrementally

```bash
# 1. Add runner.build span only
# 2. Test that builds still work
# 3. Check Sentry for runner.build span
# 4. Verify child AI spans appear under runner.build

# 5. Add broker forwarding span
# 6. Test events still flow through
# 7. Check Sentry for broker.forwardEvent spans

# 8. Add API handler spans
# 9. Test DB updates still work
# 10. Check Sentry for complete trace: runner → broker → API → DB
```

### 3. Verify Graceful Degradation

```bash
# 1. Remove _sentry field from event payload
# 2. Verify app still works (no crashes)
# 3. Check Sentry for disconnected traces (expected)

# 4. Re-add _sentry field
# 5. Verify traces are now connected
```

---

## Performance Considerations

### Overhead of Manual Spans

- **Minimal**: Sentry spans are lightweight (microseconds)
- **Only adds overhead where we explicitly add spans**
- **Automatic sampling** prevents overwhelming Sentry

### Recommendations

1. **Start with critical path only** (runner.build, broker.forwardEvent)
2. **Add more spans gradually** based on observed value
3. **Use `tracesSampler`** to reduce noise:

```typescript
tracesSampler: ({ name, attributes }) => {
  // Never trace health checks
  if (name?.includes('/health')) return 0;
  
  // Sample runner.build at 100%
  if (name?.includes('runner.build')) return 1.0;
  
  // Sample everything else at 50%
  return 0.5;
},
```

---

## Migration Checklist

### Phase 1: Runner Build Span (Critical)
- [ ] Add `Sentry.startSpan` around `start-build` handler
- [ ] Verify build events still work
- [ ] Check Sentry for `runner.build` spans with child AI spans
- [ ] Verify no performance regression

### Phase 2: Broker Event Forwarding (Important)
- [ ] Add trace context extraction in broker WebSocket handler
- [ ] Add trace headers to HTTP forward
- [ ] Verify events still flow correctly
- [ ] Check Sentry for `broker.forwardEvent` spans
- [ ] Verify traces link runner → broker

### Phase 3: API Handler Spans (Nice-to-Have)
- [ ] Add span around DB operations in `/api/runner/events`
- [ ] Verify DB updates still work
- [ ] Check Sentry for complete trace: runner → broker → API → DB
- [ ] Measure DB query performance

### Phase 4: Persistent Processor (Optional)
- [ ] Add spans around `persistEvent` and `finalizeSession`
- [ ] Verify build state persistence still works
- [ ] Check Sentry for DB write performance
- [ ] Identify slow queries

### Phase 5: WebSocket Broadcasting (Optional)
- [ ] Add trace context to WebSocket messages
- [ ] Verify frontend still receives updates
- [ ] Check Sentry for WebSocket broadcast correlation
- [ ] Evaluate if the visibility is worth the complexity

---

## Rollback Plan

If manual tracing causes issues:

1. **Remove manual spans** (revert to automatic only)
2. **Keep type definitions** (they're harmless if unused)
3. **Preserve `tracePropagationTargets`** (this is safe and useful)
4. **Document what didn't work** and why

---

## Key Insights

### ✅ What We Should Do

1. **Add manual spans for business logic** that automatic instrumentation misses
2. **Propagate trace context across WebSocket boundaries** (HTTP auto-propagation doesn't work here)
3. **Make trace context optional** so the app works without it
4. **Start minimal** and add more spans based on observed value

### ❌ What We Should NOT Do

1. **Don't wrap every function** in a span (too much noise)
2. **Don't break existing functionality** to add tracing
3. **Don't assume trace context is always available** (graceful degradation)
4. **Don't add spans where automatic instrumentation already works** (HTTP, AI SDK)

---

## Conclusion

The strategy is to **add a thin manual tracing layer** on top of the existing automatic instrumentation:

1. **Runner**: Wrap the build orchestration in `runner.build` span
2. **Broker**: Extract trace context from WebSocket, add to HTTP headers
3. **API**: Add child spans for DB operations
4. **Persistence**: Add spans for DB writes and finalization
5. **WebSocket**: Optionally add trace context to broadcasts

This gives us **end-to-end visibility** without breaking existing functionality. The key is making trace propagation **optional** and **complementary** to automatic instrumentation.

**Start with Phase 1 (runner.build)** and measure the value before proceeding to later phases.

