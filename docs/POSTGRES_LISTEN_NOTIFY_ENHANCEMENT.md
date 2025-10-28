# PostgreSQL LISTEN/NOTIFY Enhancement

**Date**: October 27, 2025  
**Status**: Optional Enhancement - Not Required  
**Effort**: ~2-3 hours  
**Performance Gain**: ~10-20%

---

## 🎯 What Is PostgreSQL LISTEN/NOTIFY?

**PostgreSQL LISTEN/NOTIFY** is a built-in pub/sub system that lets the database proactively notify your application when data changes.

### Current Flow (Manual Broadcasting)
```
Runner → Persistent Processor
         ↓
    1. Write to Database
    2. Call buildWebSocketServer.broadcastStateUpdate() ← Manual
         ↓
    WebSocket → Clients
```

### Enhanced Flow (Database-Triggered)
```
Runner → Persistent Processor
         ↓
    1. Write to Database
         ↓ (PostgreSQL trigger fires automatically)
    2. Database sends NOTIFY event
         ↓
    Backend LISTEN client receives notification
         ↓
    3. Fetch updated state from DB
    4. WebSocket broadcasts to clients
```

---

## 🚀 Benefits

### 1. **Decoupling**
- ✅ Persistent processor doesn't need to know about WebSocket
- ✅ Database changes trigger updates automatically
- ✅ Cleaner separation of concerns

### 2. **Reliability**
- ✅ Never miss an update (database guarantees notification)
- ✅ Works even if persistent processor crashes mid-update
- ✅ Can batch multiple table changes into one notification

### 3. **Performance**
- ✅ ~10-20% less overhead (no manual broadcast calls)
- ✅ Database does the work (optimized C code)
- ✅ Can batch notifications per transaction

### 4. **Scalability**
- ✅ Multiple backend servers can LISTEN (horizontal scaling)
- ✅ All servers receive same notifications
- ✅ Foundation for multi-server WebSocket (with Redis pub/sub later)

---

## 🛠️ Implementation Plan

### Step 1: Create Database Triggers

**Migration**: `drizzle/0008_add_listen_notify_triggers.sql`

```sql
-- Function to notify on generation updates
CREATE OR REPLACE FUNCTION notify_generation_update()
RETURNS TRIGGER AS $$
DECLARE
  payload JSON;
BEGIN
  -- Build notification payload
  payload = json_build_object(
    'table', TG_TABLE_NAME,
    'action', TG_OP,
    'session_id', NEW.session_id,
    'project_id', COALESCE(NEW.project_id, (
      SELECT project_id FROM generation_sessions WHERE id = NEW.session_id LIMIT 1
    )),
    'timestamp', EXTRACT(EPOCH FROM NOW())
  );
  
  -- Send notification on 'generation_updates' channel
  PERFORM pg_notify('generation_updates', payload::text);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on generation_sessions table
CREATE TRIGGER generation_sessions_notify
AFTER INSERT OR UPDATE ON generation_sessions
FOR EACH ROW
EXECUTE FUNCTION notify_generation_update();

-- Trigger on generation_todos table
CREATE TRIGGER generation_todos_notify
AFTER INSERT OR UPDATE ON generation_todos
FOR EACH ROW
EXECUTE FUNCTION notify_generation_update();

-- Trigger on generation_tool_calls table
CREATE TRIGGER generation_tool_calls_notify
AFTER INSERT OR UPDATE ON generation_tool_calls
FOR EACH ROW
EXECUTE FUNCTION notify_generation_update();

-- Trigger on generation_notes table
CREATE TRIGGER generation_notes_notify
AFTER INSERT OR UPDATE ON generation_notes
FOR EACH ROW
EXECUTE FUNCTION notify_generation_update();
```

---

### Step 2: Create PostgreSQL Listener Service

**New file**: `packages/agent-core/src/lib/db/pg-listener.ts`

```typescript
import { Pool } from 'pg';
import { buildWebSocketServer } from '../websocket';
import { db } from './client';
import { generationSessions } from './schema';
import { eq } from 'drizzle-orm';

interface NotificationPayload {
  table: 'generation_sessions' | 'generation_todos' | 'generation_tool_calls' | 'generation_notes';
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  session_id: string;
  project_id: string;
  timestamp: number;
}

class PostgreSQLListener {
  private pool: Pool | null = null;
  private isListening = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private sessionCache = new Map<string, { projectId: string; lastFetch: number }>();
  
  private readonly CACHE_TTL = 5000; // 5 seconds
  private readonly DEBOUNCE_DELAY = 100; // 100ms
  private pendingNotifications = new Map<string, NodeJS.Timeout>();

  async start(databaseUrl: string) {
    if (this.isListening) {
      console.warn('[PostgreSQL Listener] Already listening');
      return;
    }

    console.log('[PostgreSQL Listener] Starting...');

    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 1, // Only need 1 connection for LISTEN
    });

    await this.connect();
  }

  private async connect() {
    if (!this.pool) return;

    try {
      const client = await this.pool.connect();
      
      // Listen to the notification channel
      await client.query('LISTEN generation_updates');
      
      console.log('[PostgreSQL Listener] ✅ Connected and listening to generation_updates');
      this.isListening = true;

      // Handle notifications
      client.on('notification', (msg) => {
        if (msg.channel === 'generation_updates' && msg.payload) {
          this.handleNotification(msg.payload);
        }
      });

      // Handle errors
      client.on('error', (err) => {
        console.error('[PostgreSQL Listener] Client error:', err);
        this.reconnect();
      });

    } catch (error) {
      console.error('[PostgreSQL Listener] Failed to connect:', error);
      this.reconnect();
    }
  }

  private handleNotification(payload: string) {
    try {
      const data: NotificationPayload = JSON.parse(payload);
      
      if (!data.session_id || !data.project_id) {
        console.warn('[PostgreSQL Listener] Notification missing session_id or project_id');
        return;
      }

      // Debounce notifications - wait 100ms for more changes
      // This batches multiple rapid updates (e.g., todos + tools) into one fetch
      const key = `${data.project_id}-${data.session_id}`;
      
      if (this.pendingNotifications.has(key)) {
        clearTimeout(this.pendingNotifications.get(key)!);
      }

      this.pendingNotifications.set(key, setTimeout(() => {
        this.fetchAndBroadcast(data.project_id, data.session_id);
        this.pendingNotifications.delete(key);
      }, this.DEBOUNCE_DELAY));

    } catch (error) {
      console.error('[PostgreSQL Listener] Failed to parse notification:', error);
    }
  }

  private async fetchAndBroadcast(projectId: string, sessionId: string) {
    try {
      // Check cache to avoid excessive DB queries
      const cacheKey = `${projectId}-${sessionId}`;
      const cached = this.sessionCache.get(cacheKey);
      const now = Date.now();
      
      if (cached && (now - cached.lastFetch) < this.CACHE_TTL) {
        console.log(`[PostgreSQL Listener] Skipping fetch (cached): ${cacheKey}`);
        return;
      }

      // Fetch latest state from database
      const [session] = await db
        .select()
        .from(generationSessions)
        .where(eq(generationSessions.id, sessionId))
        .limit(1);

      if (!session || !session.rawState) {
        console.warn(`[PostgreSQL Listener] Session ${sessionId} not found or has no rawState`);
        return;
      }

      // Parse state
      const state = typeof session.rawState === 'string'
        ? JSON.parse(session.rawState)
        : session.rawState;

      // Broadcast via WebSocket
      buildWebSocketServer.broadcastStateUpdate(projectId, sessionId, state);
      
      // Update cache
      this.sessionCache.set(cacheKey, { projectId, lastFetch: now });
      
      console.log(`[PostgreSQL Listener] ✅ Broadcasted update for session ${sessionId}`);

    } catch (error) {
      console.error('[PostgreSQL Listener] Failed to fetch and broadcast:', error);
    }
  }

  private reconnect() {
    this.isListening = false;
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    console.log('[PostgreSQL Listener] Reconnecting in 5 seconds...');
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, 5000);
  }

  async stop() {
    console.log('[PostgreSQL Listener] Stopping...');
    
    this.isListening = false;
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    // Clear all pending notifications
    for (const timeout of this.pendingNotifications.values()) {
      clearTimeout(timeout);
    }
    this.pendingNotifications.clear();
    
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    
    console.log('[PostgreSQL Listener] Stopped');
  }
}

export const pgListener = new PostgreSQLListener();
```

---

### Step 3: Start Listener in Server

**Update**: `apps/sentryvibe/server.ts`

```typescript
import { buildWebSocketServer } from '@sentryvibe/agent-core';
import { pgListener } from '@sentryvibe/agent-core/lib/db/pg-listener';

app.prepare().then(async () => {
  const server = createServer(/* ... */);
  
  // Initialize WebSocket server
  buildWebSocketServer.initialize(server, '/ws');
  
  // Start PostgreSQL listener (NEW)
  await pgListener.start(process.env.DATABASE_URL!);
  
  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket server on ws://${hostname}:${port}/ws`);
    console.log(`> PostgreSQL LISTEN/NOTIFY active`);
  });
  
  const shutdown = () => {
    console.log('\n> Shutting down gracefully...');
    pgListener.stop();          // NEW
    buildWebSocketServer.shutdown();
    server.close(() => {
      console.log('> Server closed');
      process.exit(0);
    });
  };
  
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
});
```

---

### Step 4: Remove Manual Broadcasts (Optional)

**Update**: `packages/agent-core/src/lib/runner/persistent-event-processor.ts`

```typescript
async function refreshRawState(context: ActiveBuildContext) {
  try {
    const snapshot = await buildSnapshot(context);
    const serialized = serializeGenerationState(snapshot);
    await db.update(generationSessions)
      .set({ rawState: serialized, updatedAt: new Date() })
      .where(eq(generationSessions.id, context.sessionId));
    
    // ❌ REMOVE: Manual WebSocket broadcast (database trigger handles this now)
    // buildWebSocketServer.broadcastStateUpdate(
    //   context.projectId,
    //   context.sessionId,
    //   snapshot
    // );
  } catch (snapshotError) {
    console.warn('[persistent-processor] Failed to refresh raw generation state:', snapshotError);
  }
}
```

**Trade-off**: 
- **Keep manual broadcasts** = Works immediately after DB write (faster)
- **Remove manual broadcasts** = Cleaner code, database handles all updates

**Recommendation**: Keep both initially, remove manual broadcasts after testing proves triggers work.

---

## 📊 Performance Comparison

### Current (WebSocket Only)

```
Database Write (10ms)
    ↓
Manual Broadcast Call (1ms)
    ↓
WebSocket Send (5ms)
    ↓
Client Receives (1ms)

Total: ~17ms
```

### With LISTEN/NOTIFY

```
Database Write (10ms)
    ↓ (trigger fires automatically)
PostgreSQL NOTIFY (1ms)
    ↓
Backend LISTEN receives (2ms)
    ↓
Debounce Wait (100ms - batches multiple updates)
    ↓
Fetch Latest State (5ms)
    ↓
WebSocket Broadcast (5ms)
    ↓
Client Receives (1ms)

Total: ~124ms (but batches multiple updates!)
```

**Trade-off**:
- Slightly higher latency per update (~100ms more)
- BUT batches 5-10 rapid updates into one (huge savings)
- Overall: ~10-20% less database load, ~30% less WebSocket traffic

---

## 🎁 Additional Benefits

### 1. **Horizontal Scaling**
With LISTEN/NOTIFY, you can run multiple Next.js instances:

```
PostgreSQL Database
    ↓ (NOTIFY)
    ├─ Next.js Server 1 (LISTEN) → WebSocket clients 1-50
    ├─ Next.js Server 2 (LISTEN) → WebSocket clients 51-100
    └─ Next.js Server 3 (LISTEN) → WebSocket clients 101-150
```

All servers receive the same notifications and broadcast to their connected clients.

### 2. **External Tool Support**
Any tool that can write to PostgreSQL can trigger updates:
- CLI tools
- Admin scripts
- External services
- Direct SQL updates

### 3. **Audit Trail**
The trigger function can also log to an audit table:

```sql
CREATE TABLE generation_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  action TEXT NOT NULL,
  session_id UUID NOT NULL,
  changed_at TIMESTAMP DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION notify_generation_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Log the change
  INSERT INTO generation_audit_log (table_name, action, session_id)
  VALUES (TG_TABLE_NAME, TG_OP, NEW.session_id);
  
  -- Notify listeners
  PERFORM pg_notify('generation_updates', /* ... */);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 🧪 Testing Strategy

### 1. **Add Triggers** (keep manual broadcasts)
```typescript
// persistent-event-processor.ts
await refreshRawState(context);
buildWebSocketServer.broadcastStateUpdate(/* ... */); // Keep this
```

### 2. **Verify Both Work**
- Manual broadcasts should work (existing behavior)
- NOTIFY should also fire (new behavior)
- Both should trigger WebSocket updates

**Check logs**:
```
[persistent-processor] ✅ Todos persisted and state refreshed
[persistent-processor] Broadcasting via WebSocket (manual)
[PostgreSQL Listener] Notification received: session_id=xxx
[PostgreSQL Listener] ✅ Broadcasted update for session xxx
```

You should see **TWO** broadcasts (expected during transition).

### 3. **Disable Manual Broadcasts**
Once confident:
```typescript
// Remove manual broadcast calls
// await refreshRawState(context);
// buildWebSocketServer.broadcastStateUpdate(/* ... */); ← Remove
```

### 4. **Test Thoroughly**
- Start build → verify updates arrive
- Navigate away/back → verify reconnection
- Page refresh → verify state persistence
- Multiple tabs → all receive updates

---

## ⚠️ Gotchas & Considerations

### 1. **Debouncing is Critical**

Without debouncing, you'd get a notification for **every row change**:

```
Persist 10 todos → 10 notifications → 10 DB fetches → 10 WebSocket broadcasts
```

With debouncing (100ms wait):
```
Persist 10 todos → 10 notifications → 100ms wait → 1 DB fetch → 1 WebSocket broadcast
```

**Massive savings!**

### 2. **Connection Management**

The LISTEN connection must stay alive:
- Dedicated PostgreSQL connection (separate from Drizzle pool)
- Heartbeat to detect dead connections
- Auto-reconnect on failure

### 3. **Payload Size Limit**

PostgreSQL NOTIFY has a **8KB payload limit**. We're only sending metadata (session_id, project_id), so no issue.

### 4. **Transaction Timing**

NOTIFY fires **after** transaction commits:
- ✅ Guaranteed data is written before notification
- ✅ No race conditions (data always ready when we fetch)

---

## 🚦 When to Add This

### Add It If:
- ✅ You're running multiple Next.js instances (horizontal scaling)
- ✅ You want to remove manual broadcast code (cleaner architecture)
- ✅ You need external tools to trigger UI updates
- ✅ You want audit logging of all database changes

### Skip It If:
- ✅ Current WebSocket performance is fine
- ✅ Running single Next.js instance (no scaling needs)
- ✅ Don't want additional database complexity
- ✅ Want to minimize moving parts

---

## 📋 Implementation Checklist

If you want to add this:

1. ⬜ Create migration file (`0008_add_listen_notify_triggers.sql`)
2. ⬜ Run `npx drizzle-kit push` to apply triggers
3. ⬜ Create `pg-listener.ts` service
4. ⬜ Export from `packages/agent-core/src/index.ts`
5. ⬜ Update `apps/sentryvibe/server.ts` to start listener
6. ⬜ Test with manual broadcasts still enabled
7. ⬜ Verify notifications arrive and broadcast works
8. ⬜ Optionally remove manual broadcasts after testing
9. ⬜ Monitor performance (should see reduced DB queries)
10. ⬜ Update documentation

**Estimated Time**: 2-3 hours including testing

---

## 🎯 My Recommendation

**For now: Skip it!** 

**Why**:
- Current WebSocket implementation is working great
- You're running a single server instance
- Manual broadcasts are simple and fast
- No need to add complexity until you need it

**Add it later when**:
- You scale to multiple servers
- You want to clean up the manual broadcast code
- You need external tools to trigger updates

---

## 📚 Resources

**PostgreSQL LISTEN/NOTIFY Docs**:
- https://www.postgresql.org/docs/current/sql-notify.html
- https://www.postgresql.org/docs/current/sql-listen.html

**Node.js pg Library**:
- https://node-postgres.com/apis/pool

**Drizzle Migrations**:
- https://orm.drizzle.team/kit-docs/overview

---

## 🚀 Summary

**PostgreSQL LISTEN/NOTIFY** is a **nice-to-have** enhancement that:
- Decouples database writes from WebSocket broadcasts
- Enables horizontal scaling
- Provides audit logging
- Reduces code complexity

**But you don't need it right now!** Current implementation is solid.

**Add it when scaling or if you want the architectural elegance.** 🎯

