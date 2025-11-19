# Sentry Tracing Comparison: Current vs. Commit abd15df

## ✅ FIXED - 2024-11-19

Both missing Sentry tracing issues have been restored:
1. ✅ `sendEvent()` Span Wrapper restored (line ~1157)
2. ✅ `continueTrace()` in WebSocket message handler restored (line ~2262)

---

## Summary
Comparing Sentry tracing implementation between commit `abd15dfdadac301915c87ae7c2363f57cb0a0a8e` (working) and previous broken state.

## Key Differences Found

### 1. ❌ MISSING: `sendEvent()` Span Wrapper (apps/runner/src/index.ts)

**Old Version (Working) - Line ~1113:**
```typescript
// Wrap critical events in span for tracing
if (shouldTrace) {
  Sentry.startSpan(
    {
      name: `runner.sendEvent.${event.type}`,
      op: 'runner.event.send',
      attributes: {
        'event.type': event.type,
        'event.projectId': event.projectId,
        'event.commandId': event.commandId,
      },
    },
    () => {
      sendOperation();
    }
  );
} else {
  sendOperation();
}
```

**Current Version (Broken) - Line 1157:**
```typescript
const startTime = Date.now();
sendOperation();  // ❌ NOT wrapped in Sentry.startSpan!
const duration = Date.now() - startTime;

if (shouldTrace && duration < 1) {
  Sentry.addBreadcrumb({  // Only breadcrumb, no span!
    category: 'runner.event.send',
    message: `Sent ${event.type} event (${duration}ms)`,
    level: 'debug',
    ...
  });
}
```

**Impact:** Events like `build-completed` and `build-failed` are not being traced when sent from runner to broker.

---

### 2. ❌ MISSING: `continueTrace()` in Command Handler (apps/runner/src/index.ts)

**Old Version (Working) - Line ~2201:**
```typescript
// Continue trace if parent trace context exists, otherwise start new
if (command._sentry?.trace) {
  console.log("continuing trace", command._sentry.trace);
  Sentry.continueTrace(
    {
      sentryTrace: command._sentry.trace,
      baggage: command._sentry.baggage,
    },
    () => {
      handleCommand(command);
    }
  );
} else {
  handleCommand(command);
}
```

**Current Version (Broken):**
```typescript
// ❌ COMPLETELY MISSING - no continueTrace call at all!
// Commands are handled directly without trace continuation
```

**Impact:** When broker sends commands with trace context, the runner doesn't continue that trace, breaking the distributed trace chain.

---

### 3. ✅ PRESENT: `runner.build` Span (apps/runner/src/index.ts)

**Status:** Still present in both versions ✓

**Current Version - Line 1725:**
```typescript
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
    // Build logic...
  }
);
```

---

### 4. ✅ PRESENT: Broker `continueTrace()` (apps/broker/src/index.ts)

**Status:** Still present in both versions ✓

**Current Version - Line 432-453:**
```typescript
if (event._sentry?.trace && event._sentry?.baggage) {
  await Sentry.continueTrace(
    {
      sentryTrace: event._sentry.trace,
      baggage: event._sentry.baggage,
    },
    async () => {
      await Sentry.startSpan(
        {
          name: `broker.forwardEvent.${event.type}`,
          op: 'broker.event.forward',
          attributes: {
            'event.type': event.type,
            'event.projectId': event.projectId,
            'event.commandId': event.commandId,
          },
        },
        async () => {
          await forwardOperation();
        }
      );
    }
  );
}
```

---

### 5. ✅ PRESENT: Backend API Spans (apps/sentryvibe/src/app/api/...)

**Status:** Still present in both versions ✓

Examples:
- `/api/runner/events/route.ts` - Line 54
- `/api/projects/[id]/route.ts` - Line 59

---

## Required Fixes

### Fix #1: Restore `sendEvent()` Span Wrapper

**File:** `apps/runner/src/index.ts`  
**Location:** Around line 1157 in `sendEvent()` function

**Change:**
```typescript
// BEFORE (Current - Broken):
const startTime = Date.now();
sendOperation();
const duration = Date.now() - startTime;

if (shouldTrace && duration < 1) {
  Sentry.addBreadcrumb({...});
}

// AFTER (Fixed):
if (shouldTrace) {
  Sentry.startSpan(
    {
      name: `runner.sendEvent.${event.type}`,
      op: 'runner.event.send',
      attributes: {
        'event.type': event.type,
        'event.projectId': event.projectId,
        'event.commandId': event.commandId,
      },
    },
    () => {
      sendOperation();
    }
  );
} else {
  sendOperation();
}
```

### Fix #2: Restore `continueTrace()` in WebSocket Message Handler

**File:** `apps/runner/src/index.ts`  
**Location:** In the WebSocket `onmessage` handler (search for where commands are received)

**Find where commands are handled and wrap with:**
```typescript
socket.on("message", async (rawData: RawData) => {
  try {
    const command = JSON.parse(rawData.toString()) as RunnerCommand;
    
    // Continue trace if parent trace context exists
    if (command._sentry?.trace) {
      console.log("continuing trace from command", command._sentry.trace);
      await Sentry.continueTrace(
        {
          sentryTrace: command._sentry.trace,
          baggage: command._sentry.baggage,
        },
        async () => {
          await handleCommand(command);
        }
      );
    } else {
      await handleCommand(command);
    }
  } catch (error) {
    // error handling...
  }
});
```

---

## Trace Flow (Should Be)

```
Backend API Request
  ↓
  Sentry.startSpan("api.runner.events.process")
  ↓
Backend → Broker (via HTTP with trace headers)
  ↓
  Broker: Sentry.continueTrace() + Sentry.startSpan("broker.forwardEvent")
  ↓
Broker → Runner (via WebSocket with _sentry context)
  ↓
  Runner: Sentry.continueTrace() ← ❌ MISSING!
  ↓
  Runner: Sentry.startSpan("runner.build") ✓ Present
  ↓
Runner → Broker (via WebSocket with _sentry context)
  ↓
  Runner: Sentry.startSpan("runner.sendEvent") ← ❌ MISSING!
```

---

## Testing After Fixes

1. Start a build from the frontend
2. Check Sentry performance monitoring for traces
3. You should see a complete trace chain:
   - `api.runner.events.process` (backend)
   - `broker.forwardEvent` (broker)
   - `runner.build` (runner)
   - `runner.sendEvent` (runner)
   - `broker.forwardEvent` (broker → backend)

---

## Notes

- The broker tracing is intact
- The backend tracing is intact
- The runner tracing is the problem - two critical pieces removed:
  1. No span wrapper on `sendEvent()`
  2. No `continueTrace()` when receiving commands

This breaks the distributed trace chain at the runner level.

