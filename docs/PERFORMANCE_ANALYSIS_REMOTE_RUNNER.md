# Performance Analysis: Remote Runner Sync Issues

**Date**: December 2024  
**Issue**: Loss of sync between tasks being accomplished and reporting in the UI  
**Architecture**: Broker + Next.js on Railway, Runner on laptop

---

## Executive Summary

Your architecture has several bottlenecks and failure points when the runner is remote (laptop) and broker/Next.js are on Railway. The main issues are:

1. **No event buffering on runner** - Events lost on WebSocket disconnect
2. **Synchronous event forwarding** - Broker blocks on slow Next.js responses
3. **No event sequencing** - Out-of-order events cause state corruption
4. **Database write latency** - Each event triggers synchronous DB writes
5. **No event acknowledgment** - Runner doesn't know if events were received
6. **Slow retry mechanism** - 30-second intervals cause long delays

---

## Current Architecture Flow

```
Runner (Laptop)
  ↓ WebSocket (unstable over internet)
Broker (Railway)
  ↓ HTTP POST (synchronous, blocks)
Next.js (Railway)
  ↓ Event Bus
Persistent Event Processor
  ↓ Database Write (synchronous)
PostgreSQL (Railway)
  ↓ WebSocket Broadcast
Frontend (Browser)
```

**Critical Path**: Runner → Broker → Next.js → Database → Frontend

---

## Identified Issues

### 1. **No Event Buffering on Runner** 🔴 CRITICAL

**Problem**: When the WebSocket connection between runner and broker drops, events are lost.

**Current Code** (`apps/runner/src/index.ts`):
```typescript
socket.send(JSON.stringify(event)); // No buffering, no retry
```

**Impact**:
- Network hiccups cause event loss
- Tasks complete but UI never updates
- No way to recover lost events

**Evidence**: Runner has reconnection logic but no event buffering during disconnects.

---

### 2. **Synchronous Event Forwarding** 🔴 CRITICAL

**Problem**: Broker forwards events synchronously and blocks on Next.js response.

**Current Code** (`apps/broker/src/index.ts:389-472`):
```typescript
async function forwardEvent(event: RunnerEvent) {
  const response = await fetchWithRetry(/* ... */); // Blocks here
  if (!response.ok) {
    failedEvents.push({ event, attempts: 1 }); // Only retries on failure
  }
}
```

**Impact**:
- If Next.js is slow (DB writes, high load), broker blocks
- Events queue up in memory
- Memory pressure and potential OOM
- No backpressure mechanism

**Evidence**: Failed events queue has retry logic, but no rate limiting or backpressure.

---

### 3. **No Event Sequencing** 🟠 HIGH

**Problem**: Events can arrive out of order, causing state corruption.

**Current Code**: No sequence numbers or timestamps on events.

**Impact**:
- Tool call "output-available" arrives before "input-available"
- State updates arrive out of order
- UI shows incorrect state
- Race conditions in `refreshRawState` (partially fixed with mutex)

**Evidence**: `BUGFIX_STATE_VERSION_RACE_CONDITION.md` shows this was partially addressed, but event ordering is still an issue.

---

### 4. **Database Write Latency** 🟠 HIGH

**Problem**: Each event triggers synchronous database writes.

**Current Code** (`packages/agent-core/src/lib/runner/persistent-event-processor.ts`):
```typescript
await persistEvent(context, eventData); // Blocks on DB write
await refreshRawState(context); // Another DB write
```

**Impact**:
- Network latency to PostgreSQL adds up
- Each tool call = 2-3 DB writes
- Slow builds = many sequential writes
- No batching of DB operations

**Evidence**: `buildSnapshot` does parallel queries, but writes are still sequential.

---

### 5. **No Event Acknowledgment** 🟡 MEDIUM

**Problem**: Runner doesn't know if events were successfully received.

**Current Code**: No ACK mechanism in broker or runner.

**Impact**:
- Runner can't retry failed events
- No visibility into event delivery
- Silent failures

---

### 6. **Slow Retry Mechanism** 🟡 MEDIUM

**Problem**: Failed events retry every 30 seconds.

**Current Code** (`apps/broker/src/index.ts:279-323`):
```typescript
setInterval(async () => {
  // Retry every 30 seconds
}, 30_000);
```

**Impact**:
- Long delays before recovery
- UI can be stale for 30+ seconds
- Events can be dropped after 5 attempts

---

## Recommended Solutions

### Solution 1: Event Buffering on Runner ⭐ HIGHEST PRIORITY

**Implementation**: Add an in-memory queue on runner that buffers events when WebSocket is disconnected.

```typescript
// apps/runner/src/index.ts

class EventBuffer {
  private queue: RunnerEvent[] = [];
  private maxSize = 1000;
  private isConnected = false;

  enqueue(event: RunnerEvent) {
    if (this.queue.length >= this.maxSize) {
      // Drop oldest events (FIFO)
      this.queue.shift();
    }
    this.queue.push(event);
    
    // Try to send immediately if connected
    if (this.isConnected) {
      this.flush();
    }
  }

  async flush() {
    if (!this.isConnected || this.queue.length === 0) return;
    
    // Send events in batches
    const batch = this.queue.splice(0, 10);
    for (const event of batch) {
      try {
        socket.send(JSON.stringify(event));
        // Wait for ACK (see Solution 2)
        await waitForAck(event.id);
      } catch (error) {
        // Re-queue on failure
        this.queue.unshift(event);
        break;
      }
    }
  }

  setConnected(connected: boolean) {
    this.isConnected = connected;
    if (connected) {
      this.flush();
    }
  }
}
```

**Benefits**:
- ✅ No event loss on disconnect
- Automatic retry on reconnect
- Bounded memory usage

**Effort**: 2-3 hours

---

### Solution 2: Event Acknowledgment Protocol ⭐ HIGH PRIORITY

**Implementation**: Add ACK mechanism between runner and broker.

**Broker** (`apps/broker/src/index.ts`):
```typescript
ws.on('message', async (data) => {
  const message = JSON.parse(data.toString()) as RunnerMessage;
  
  if (isRunnerEvent(message)) {
    const event = message as RunnerEvent;
    
    // Forward to Next.js
    await forwardEvent(event);
    
    // Send ACK back to runner
    ws.send(JSON.stringify({
      type: 'event-ack',
      eventId: event.id || event.commandId,
      timestamp: Date.now()
    }));
  }
});
```

**Runner** (`apps/runner/src/index.ts`):
```typescript
const pendingAcks = new Map<string, { event: RunnerEvent; retries: number }>();

function sendEventWithAck(event: RunnerEvent) {
  const eventId = event.id || `${event.commandId}-${Date.now()}`;
  event.id = eventId;
  
  pendingAcks.set(eventId, { event, retries: 0 });
  socket.send(JSON.stringify(event));
  
  // Timeout after 5 seconds
  setTimeout(() => {
    if (pendingAcks.has(eventId)) {
      const pending = pendingAcks.get(eventId)!;
      if (pending.retries < 3) {
        pending.retries++;
        socket.send(JSON.stringify(event)); // Retry
      } else {
        console.error(`Event ${eventId} failed after 3 retries`);
        pendingAcks.delete(eventId);
      }
    }
  }, 5000);
}

socket.on('message', (data) => {
  const message = JSON.parse(data.toString());
  if (message.type === 'event-ack') {
    pendingAcks.delete(message.eventId);
  }
});
```

**Benefits**:
- ✅ Guaranteed delivery
- ✅ Automatic retry on failure
- ✅ Visibility into event delivery

**Effort**: 3-4 hours

---

### Solution 3: Asynchronous Event Forwarding ⭐ HIGH PRIORITY

**Implementation**: Make broker event forwarding non-blocking with a worker queue.

**Broker** (`apps/broker/src/index.ts`):
```typescript
import { Queue } from 'bull'; // Or use a simple in-memory queue

const eventQueue = new Queue('events', {
  limiter: {
    max: 100, // Max 100 events per second
    duration: 1000
  }
});

// Non-blocking event forwarding
async function forwardEvent(event: RunnerEvent) {
  await eventQueue.add('forward', event, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: 100, // Keep last 100 for debugging
  });
}

// Worker processes events
eventQueue.process('forward', async (job) => {
  const event = job.data;
  const response = await fetchWithRetry(/* ... */);
  
  if (!response.ok) {
    throw new Error(`Failed to forward event: ${response.status}`);
  }
});
```

**Alternative (Simpler)**: Use a simple in-memory queue with workers:

```typescript
class EventQueue {
  private queue: RunnerEvent[] = [];
  private workers = 5; // Parallel workers
  private processing = false;

  async enqueue(event: RunnerEvent) {
    this.queue.push(event);
    this.process();
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    // Process up to 10 events in parallel
    const batch = this.queue.splice(0, 10);
    await Promise.allSettled(
      batch.map(event => this.forwardEvent(event))
    );

    this.processing = false;
    if (this.queue.length > 0) {
      setImmediate(() => this.process());
    }
  }

  private async forwardEvent(event: RunnerEvent) {
    // Existing forwardEvent logic
  }
}
```

**Benefits**:
- ✅ Non-blocking event processing
- ✅ Backpressure handling
- ✅ Parallel processing
- ✅ Better error handling

**Effort**: 4-5 hours

---

### Solution 4: Event Sequencing ⭐ MEDIUM PRIORITY

**Implementation**: Add sequence numbers to events.

**Runner** (`apps/runner/src/index.ts`):
```typescript
let eventSequence = 0;

function createEvent(type: string, data: any): RunnerEvent {
  return {
    type,
    data,
    sequence: eventSequence++,
    timestamp: Date.now(),
    commandId,
    projectId
  };
}
```

**Broker** (`apps/broker/src/index.ts`):
```typescript
const eventSequences = new Map<string, number>(); // commandId -> lastSequence

async function forwardEvent(event: RunnerEvent) {
  const lastSeq = eventSequences.get(event.commandId) || -1;
  
  // Check for out-of-order events
  if (event.sequence !== undefined && event.sequence <= lastSeq) {
    console.warn(`Out-of-order event: ${event.sequence} <= ${lastSeq}`);
    // Buffer and reorder (or drop if too old)
    return;
  }
  
  eventSequences.set(event.commandId, event.sequence || 0);
  // Forward event...
}
```

**Benefits**:
- ✅ Detect out-of-order events
- ✅ Can buffer and reorder
- ✅ Better debugging

**Effort**: 2-3 hours

---

### Solution 5: Batch Database Writes ⭐ MEDIUM PRIORITY

**Implementation**: Batch multiple events into single DB transactions.

**Persistent Processor** (`packages/agent-core/src/lib/runner/persistent-event-processor.ts`):
```typescript
class BatchedEventProcessor {
  private batch: Array<{ context: ActiveBuildContext; event: any }> = [];
  private batchTimeout = 100; // 100ms batching window
  private batchTimer: NodeJS.Timeout | null = null;

  async enqueue(context: ActiveBuildContext, event: any) {
    this.batch.push({ context, event });
    
    // Flush immediately for high-priority events
    if (event.type === 'tool-output-available' || event.type === 'finish') {
      await this.flush();
      return;
    }
    
    // Otherwise batch
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flush(), this.batchTimeout);
    }
  }

  private async flush() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.batch.length === 0) return;

    const batch = this.batch.splice(0);
    
    // Group by context for transaction batching
    const byContext = new Map<string, typeof batch>();
    for (const item of batch) {
      const key = item.context.sessionId;
      if (!byContext.has(key)) {
        byContext.set(key, []);
      }
      byContext.get(key)!.push(item);
    }

    // Process each context in parallel
    await Promise.all(
      Array.from(byContext.entries()).map(([sessionId, items]) =>
        db.transaction(async (tx) => {
          for (const item of items) {
            await persistEvent(item.context, item.event, tx);
          }
          // Single refreshRawState at end
          await refreshRawState(item.context, tx);
        })
      )
    );
  }
}
```

**Benefits**:
- ✅ Fewer DB round trips
- ✅ Better performance
- ✅ Atomic updates

**Effort**: 4-5 hours

---

### Solution 6: Faster Retry Mechanism ⭐ LOW PRIORITY

**Implementation**: Reduce retry interval and add exponential backoff.

**Broker** (`apps/broker/src/index.ts`):
```typescript
// Retry failed events every 5 seconds (instead of 30)
setInterval(async () => {
  if (failedEvents.length === 0) return;

  // Process with exponential backoff
  const now = Date.now();
  const batch = failedEvents.filter(item => {
    const age = now - item.lastAttempt;
    const delay = Math.min(1000 * Math.pow(2, item.attempts - 1), 10000);
    return age >= delay;
  }).splice(0, 20); // Process up to 20 at a time

  for (const item of batch) {
    item.lastAttempt = now;
    // Retry logic...
  }
}, 5000); // Every 5 seconds
```

**Benefits**:
- ✅ Faster recovery
- ✅ Better user experience

**Effort**: 1 hour

---

## Architecture Improvements

### Option A: Message Queue (Recommended for Scale)

**Architecture**:
```
Runner → Redis/RabbitMQ → Broker → Next.js → Database
```

**Benefits**:
- ✅ Guaranteed delivery
- ✅ Event persistence
- ✅ Better scalability
- ✅ Decoupling

**Trade-offs**:
- Additional infrastructure
- More complexity
- Higher cost

**Effort**: 1-2 days

---

### Option B: Database-First Architecture

**Architecture**:
```
Runner → Direct DB Writes → PostgreSQL LISTEN/NOTIFY → Next.js → Frontend
```

**Benefits**:
- ✅ Single source of truth
- ✅ No event loss
- ✅ Simpler architecture

**Trade-offs**:
- Runner needs DB access
- More DB load
- Network latency to DB

**Effort**: 2-3 days

---

### Option C: Hybrid Approach (Recommended for Now)

**Architecture**:
```
Runner → Event Buffer → Broker (with ACK) → Next.js → Database → WebSocket → Frontend
```

**Implementation**:
1. Add event buffering on runner (Solution 1)
2. Add ACK protocol (Solution 2)
3. Make forwarding async (Solution 3)
4. Add sequencing (Solution 4)

**Benefits**:
- ✅ No new infrastructure
- ✅ Incremental improvements
- ✅ Backward compatible

**Effort**: 1-2 days

---

## Implementation Priority

### Phase 1: Critical Fixes (1-2 days)
1. ✅ Event buffering on runner (Solution 1)
2. ✅ Event acknowledgment (Solution 2)
3. ✅ Asynchronous forwarding (Solution 3)

### Phase 2: Stability Improvements (1 day)
4. ✅ Event sequencing (Solution 4)
5. ✅ Faster retry mechanism (Solution 6)

### Phase 3: Performance Optimization (1-2 days)
6. ✅ Batch database writes (Solution 5)

---

## Monitoring & Observability

### Metrics to Track

1. **Event Delivery Rate**
   - Events sent vs. events ACK'd
   - Lost events per build

2. **Event Latency**
   - Time from runner → broker → Next.js → DB
   - P95, P99 latencies

3. **Connection Health**
   - WebSocket disconnect frequency
   - Reconnection time

4. **Queue Sizes**
   - Runner event buffer size
   - Broker failed events queue
   - Next.js event processing queue

### Recommended Tools

- **Sentry**: Already integrated, add custom metrics
- **Prometheus**: Export metrics from broker/runner
- **Grafana**: Dashboard for monitoring

---

## Testing Strategy

### 1. Network Failure Simulation
- Disconnect runner WebSocket mid-build
- Verify events are buffered and resent
- Check UI eventually syncs

### 2. Slow Next.js Simulation
- Add artificial delay to `/api/runner/events`
- Verify broker doesn't block
- Check events eventually process

### 3. Out-of-Order Events
- Send events with wrong sequence numbers
- Verify they're reordered or dropped
- Check state remains consistent

### 4. High Load Testing
- Generate 1000+ events rapidly
- Verify no event loss
- Check memory usage stays bounded

---

## Questions to Consider

1. **How critical is real-time updates?**
   - If 1-2 second delay is acceptable, batching is fine
   - If sub-second needed, need more aggressive optimizations

2. **What's your acceptable event loss rate?**
   - 0% = Need guaranteed delivery (message queue)
   - <1% = Current architecture with improvements
   - >1% = Current architecture might be fine

3. **What's your scale?**
   - <10 concurrent builds = Current architecture OK
   - 10-100 = Need async forwarding + batching
   - >100 = Need message queue

4. **What's your budget?**
   - Free = In-memory improvements only
   - Low = Redis for event buffering
   - Medium = Full message queue (RabbitMQ/Kafka)

---

## Next Steps

1. **Review this document** with team
2. **Prioritize solutions** based on your needs
3. **Implement Phase 1** (critical fixes)
4. **Monitor improvements** with metrics
5. **Iterate** based on results

---

## References

- `docs/COMMUNICATION_FLOW_ANALYSIS.md` - Current architecture
- `docs/BUGFIX_STATE_VERSION_RACE_CONDITION.md` - Race condition fix
- `docs/RESEARCH_SSE_ISSUES.md` - Previous sync issues
- `apps/broker/src/index.ts` - Broker implementation
- `apps/runner/src/index.ts` - Runner implementation
- `packages/agent-core/src/lib/runner/persistent-event-processor.ts` - Event processing
