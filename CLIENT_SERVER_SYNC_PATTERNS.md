# Client-Server Sync Patterns: PostgreSQL ↔ Client State

**Date:** November 1, 2025
**Question:** How to handle relationship between PostgreSQL and Zustand/TanStack DB?

---

## Executive Summary

**Key Insight:** PostgreSQL is always the **source of truth**. Client state (Zustand/TanStack DB) is a **local cache/view layer** that syncs with the database.

**Pattern Choice Depends On:**
- Are messages persisted to DB? (Currently: **YES** - you have a messages table)
- Do you need offline support? (Currently: **NO**)
- Do you need multi-user collaboration? (Currently: **NO**, but future maybe)

**Recommended Patterns:**
- **Zustand:** Simple sync pattern (fetch → hydrate → optimistic updates → sync back)
- **TanStack DB:** Advanced sync with QueryCollection or ElectricCollection

---

## Current Architecture Analysis

### Your Current Setup

**Database Schema:**
```sql
-- PostgreSQL tables (Drizzle)
projects (id, name, status, ...)
messages (id, project_id, role, content, parts, ...)  -- Messages ARE persisted!
running_processes (id, project_id, ...)
```

**API Endpoints:**
```
POST /api/chat                    -- Streams response, saves to DB
GET  /api/projects/[id]/messages  -- Fetches saved messages
```

**Current Flow:**
```
1. User sends message
   ↓
2. POST /api/chat (streaming)
   ↓
3. Assistant response streams to client
   ↓
4. Message saved to PostgreSQL
   ↓
5. Client holds in useState (ephemeral)
   ↓
6. On project switch: Fetch from DB again
```

**Key Observations:**
✅ Messages ARE persisted to PostgreSQL
✅ You have `/api/projects/[id]/messages` endpoint
✅ Messages loaded when switching projects
✅ Real-time updates via streaming (not polling)

**This means:** You need a **sync strategy** between PostgreSQL and client state.

---

## Pattern 1: Zustand with PostgreSQL

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       PostgreSQL (Source of Truth)          │
│                                                             │
│  projects │ messages │ running_processes                   │
└─────────────────────────────────────────────────────────────┘
                          ↑ ↓
                    API Calls (REST)
                          ↑ ↓
┌─────────────────────────────────────────────────────────────┐
│                     TanStack Query                          │
│  • Fetches from API                                         │
│  • Manages cache (30s staleTime)                            │
│  • Handles mutations                                        │
└─────────────────────────────────────────────────────────────┘
                          ↑ ↓
                    Hydration / Updates
                          ↑ ↓
┌─────────────────────────────────────────────────────────────┐
│                        Zustand Store                        │
│  • Ephemeral client state                                   │
│  • Fast updates (optimistic)                                │
│  • Streaming message updates                                │
└─────────────────────────────────────────────────────────────┘
                          ↑
                    React Components
```

### Implementation

#### Step 1: Define Zustand Store

```typescript
// src/stores/useMessageStore.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface MessageStore {
  // State
  messagesByProject: Record<string, {
    messages: Record<string, Message>;
    messageOrder: string[];
    isHydrated: boolean; // Track if loaded from DB
    lastSyncedAt: number | null;
  }>;

  // Actions
  hydrateProject: (projectId: string, messages: Message[]) => void;
  addMessage: (projectId: string, message: Message) => void;
  upsertMessage: (projectId: string, message: Message) => void;
  clearProject: (projectId: string) => void;

  // Sync helpers
  markSynced: (projectId: string) => void;
  needsSync: (projectId: string) => boolean;
}

export const useMessageStore = create<MessageStore>()(
  immer((set, get) => ({
    messagesByProject: {},

    // Hydrate from PostgreSQL (via TanStack Query)
    hydrateProject: (projectId, messages) => set((state) => {
      state.messagesByProject[projectId] = {
        messages: Object.fromEntries(messages.map(m => [m.id, m])),
        messageOrder: messages.map(m => m.id),
        isHydrated: true,
        lastSyncedAt: Date.now(),
      };
    }),

    // Add new message (optimistic, will be saved to DB)
    addMessage: (projectId, message) => set((state) => {
      if (!state.messagesByProject[projectId]) {
        state.messagesByProject[projectId] = {
          messages: {},
          messageOrder: [],
          isHydrated: false,
          lastSyncedAt: null,
        };
      }

      const project = state.messagesByProject[projectId];
      project.messages[message.id] = message;
      project.messageOrder.push(message.id);
    }),

    // Upsert (for streaming updates)
    upsertMessage: (projectId, message) => set((state) => {
      if (!state.messagesByProject[projectId]) {
        state.messagesByProject[projectId] = {
          messages: {},
          messageOrder: [],
          isHydrated: false,
          lastSyncedAt: null,
        };
      }

      const project = state.messagesByProject[projectId];
      const exists = project.messages[message.id];

      project.messages[message.id] = message;

      if (!exists) {
        project.messageOrder.push(message.id);
      }
    }),

    clearProject: (projectId) => set((state) => {
      delete state.messagesByProject[projectId];
    }),

    markSynced: (projectId) => set((state) => {
      if (state.messagesByProject[projectId]) {
        state.messagesByProject[projectId].lastSyncedAt = Date.now();
      }
    }),

    needsSync: (projectId) => {
      const project = get().messagesByProject[projectId];
      return !project?.isHydrated;
    },
  }))
);
```

#### Step 2: Create TanStack Query Hook

```typescript
// src/queries/messages.ts
import { useQuery } from '@tanstack/react-query';

async function fetchProjectMessages(projectId: string): Promise<Message[]> {
  const res = await fetch(`/api/projects/${projectId}/messages`);
  if (!res.ok) throw new Error('Failed to fetch messages');
  const data = await res.json();
  return data.messages || [];
}

export function useProjectMessages(projectId: string | null) {
  return useQuery({
    queryKey: ['projects', projectId, 'messages'],
    queryFn: () => fetchProjectMessages(projectId!),
    enabled: !!projectId,
    staleTime: 30000, // 30 seconds
  });
}
```

#### Step 3: Hydration Pattern in Component

```typescript
// src/app/page.tsx
import { useMessageStore } from '@/stores/useMessageStore';
import { useProjectMessages } from '@/queries/messages';

function ChatComponent({ projectId }: { projectId: string }) {
  // Fetch from PostgreSQL via TanStack Query
  const { data: messagesFromDB, isLoading } = useProjectMessages(projectId);

  // Zustand store
  const hydrateProject = useMessageStore(s => s.hydrateProject);
  const needsSync = useMessageStore(s => s.needsSync(projectId));
  const messages = useMessageStore(s => {
    const project = s.messagesByProject[projectId];
    if (!project) return [];
    return project.messageOrder.map(id => project.messages[id]);
  });

  // Hydrate Zustand from TanStack Query when data arrives
  useEffect(() => {
    if (messagesFromDB && needsSync) {
      hydrateProject(projectId, messagesFromDB);
    }
  }, [messagesFromDB, projectId, hydrateProject, needsSync]);

  // Render
  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      {messages.map(msg => (
        <ChatUpdate key={msg.id} content={msg.content} />
      ))}
    </div>
  );
}
```

#### Step 4: Streaming Updates Pattern

```typescript
// Handle streaming response from /api/chat
async function handleChatStream(projectId: string, userMessage: string) {
  const upsertMessage = useMessageStore.getState().upsertMessage;

  // 1. Add user message optimistically (will be saved by API)
  const userMsg: Message = {
    id: nanoid(),
    projectId,
    role: 'user',
    content: userMessage,
    parts: [{ type: 'text', text: userMessage }],
    timestamp: Date.now(),
  };
  upsertMessage(projectId, userMsg);

  // 2. Stream assistant response
  const response = await fetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ projectId, message: userMessage }),
  });

  const reader = response.body.getReader();
  const assistantMsg: Message = {
    id: nanoid(),
    projectId,
    role: 'assistant',
    content: '',
    parts: [],
    timestamp: Date.now(),
  };

  // 3. Update Zustand as stream arrives
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = new TextDecoder().decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;

      const data = JSON.parse(line.slice(6));

      if (data.type === 'text-delta') {
        // Update assistant message incrementally
        assistantMsg.content += data.text;
        upsertMessage(projectId, assistantMsg);
      }
    }
  }

  // 4. API saved both messages to PostgreSQL
  // On next project switch, TanStack Query will fetch fresh data
}
```

### Sync Strategy: Write-Through

**Pattern:** Optimistic update → Write to PostgreSQL → TanStack Query invalidates cache

```typescript
// User sends message
const sendMessage = useMutation({
  mutationFn: async ({ projectId, content }: { projectId: string; content: string }) => {
    // 1. Optimistic update to Zustand
    const userMsg: Message = {
      id: nanoid(),
      projectId,
      role: 'user',
      content,
      parts: [{ type: 'text', text: content }],
      timestamp: Date.now(),
    };
    useMessageStore.getState().addMessage(projectId, userMsg);

    // 2. Send to API (saves to PostgreSQL)
    const res = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ projectId, message: content }),
    });

    return res.json();
  },

  onSuccess: (data, { projectId }) => {
    // 3. Invalidate TanStack Query cache
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'messages'] });

    // 4. Mark Zustand as synced
    useMessageStore.getState().markSynced(projectId);
  },

  onError: (error, { projectId }) => {
    // Rollback Zustand on error
    // (Or keep and show error indicator)
    console.error('Failed to send message:', error);
  },
});
```

### Benefits of This Pattern

✅ **Simple mental model** - PostgreSQL is source of truth
✅ **Fast UI** - Zustand provides instant updates
✅ **Persistent** - Messages saved to database
✅ **Works with TanStack Query** - Leverages existing infrastructure
✅ **No conflicts** - Single user per project
✅ **Easy debugging** - Clear data flow

### Limitations

⚠️ **Not offline-first** - Needs connection to fetch
⚠️ **Manual sync logic** - You write hydration code
⚠️ **No conflict resolution** - Assumes single user

---

## Pattern 2: TanStack DB with PostgreSQL

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  PostgreSQL (Source of Truth)               │
│                                                             │
│  projects │ messages │ running_processes                   │
└─────────────────────────────────────────────────────────────┘
                          ↑ ↓
                    Sync Engine / API
                          ↑ ↓
┌─────────────────────────────────────────────────────────────┐
│                     TanStack DB                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │          messageCollection (QueryCollection)        │   │
│  │  • Fetches via TanStack Query                       │   │
│  │  • Stores locally (IndexedDB optional)              │   │
│  │  • Syncs via onInsert/onUpdate handlers             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Live Queries                           │   │
│  │  • Sub-millisecond updates                          │   │
│  │  • Differential dataflow                            │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          ↑
                    React Components
```

### Implementation

#### Step 1: Create Collection with Query Integration

```typescript
// src/collections/messageCollection.ts
import { createCollection } from '@tanstack/db';
import { queryCollectionOptions } from '@tanstack/db';

export const messageCollection = createCollection<Message, string>({
  // Populate from TanStack Query
  ...queryCollectionOptions({
    queryKey: ['messages'],
    queryFn: async () => {
      const res = await fetch('/api/messages');
      return res.json();
    },
  }),

  // Sync back to PostgreSQL on mutations
  onInsert: async (message) => {
    console.log('Inserting message to PostgreSQL:', message.id);

    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
  },

  onUpdate: async (id, updates) => {
    console.log('Updating message in PostgreSQL:', id);

    await fetch(`/api/messages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  },

  onDelete: async (id) => {
    console.log('Deleting message from PostgreSQL:', id);

    await fetch(`/api/messages/${id}`, {
      method: 'DELETE',
    });
  },
});
```

#### Step 2: Use in Components

```typescript
// src/app/page.tsx
import { useLiveQuery } from '@tanstack/db';
import { messageCollection } from '@/collections/messageCollection';

function ChatComponent({ projectId }: { projectId: string }) {
  // Live query - automatically updates
  const { data: messages } = useLiveQuery((q) =>
    q.from({ message: messageCollection })
     .where(({ message }) => message.projectId === projectId)
     .orderBy(({ message }) => message.timestamp)
  );

  // Send message (optimistic + syncs to PostgreSQL)
  const handleSendMessage = (content: string) => {
    const newMessage: Message = {
      id: nanoid(),
      projectId,
      role: 'user',
      content,
      parts: [{ type: 'text', text: content }],
      timestamp: Date.now(),
    };

    // Insert into collection
    // Triggers onInsert handler which saves to PostgreSQL
    messageCollection.insert(newMessage);
  };

  // Streaming updates
  const handleStreamingUpdate = (messageId: string, newContent: string) => {
    messageCollection.update(messageId, (draft) => {
      draft.content = newContent;
      // Triggers onUpdate handler which syncs to PostgreSQL
    });
  };

  return (
    <div>
      {messages?.map(msg => (
        <ChatUpdate key={msg.id} content={msg.content} />
      ))}
      <button onClick={() => handleSendMessage('Hello!')}>
        Send
      </button>
    </div>
  );
}
```

### Sync Strategy: Built-In Optimistic Updates

**Pattern:** TanStack DB handles optimistic updates + sync automatically

```typescript
// User sends message
messageCollection.insert(newMessage);

// What happens:
// 1. Immediately added to collection (optimistic)
// 2. Live queries update instantly (<1ms)
// 3. UI re-renders with new message
// 4. onInsert handler fires (async)
// 5. Message saved to PostgreSQL
// 6. If error: Can rollback or show error

// Streaming update
messageCollection.update(messageId, (draft) => {
  draft.content += newChunk;
});

// What happens:
// 1. Collection updated immediately
// 2. Live queries update (<1ms)
// 3. UI re-renders
// 4. onUpdate handler fires (async)
// 5. Synced to PostgreSQL
```

### Advanced: Offline-First with ElectricSQL

**For multi-user collaboration + offline support:**

```typescript
import { createElectricCollection } from '@tanstack/db';

// Use Electric for real-time sync
export const messageCollection = createElectricCollection<Message>({
  shape: {
    url: 'http://localhost:3000/v1/shape/messages',
    table: 'messages',
    where: `project_id = '${projectId}'`, // Subscribe to project messages
  },

  // Conflict resolution
  onConflict: (local, remote) => {
    // Last-write-wins or custom logic
    return remote.timestamp > local.timestamp ? remote : local;
  },
});

// Now you get:
// - Real-time sync across clients
// - Offline support (writes queued)
// - Conflict resolution
// - Local-first architecture
```

**Requires:**
- ElectricSQL running (separate service)
- PostgreSQL logical replication
- More complex setup

### Benefits of This Pattern

✅ **Automatic sync** - Collection handlers manage it
✅ **Sub-millisecond updates** - Differential dataflow
✅ **Built-in optimistic updates** - No manual rollback
✅ **Advanced queries** - Cross-collection joins
✅ **Offline-first option** - With ElectricCollection
✅ **Real-time collaboration** - With Electric sync

### Limitations

⚠️ **More complex** - Learning curve
⚠️ **Beta software** - API may change
⚠️ **Larger bundle** - +35KB
⚠️ **Overkill for simple chat** - Unless using broadly

---

## Pattern 3: Hybrid (Best of Both Worlds)

### When to Use What

**TanStack Query** → Server state (API calls, projects, files)
**Zustand** → Ephemeral UI state (chat during session)
**TanStack DB** → Complex client state (file trees, logs, history)

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                PostgreSQL (Source of Truth)                  │
└──────────────────────────────────────────────────────────────┘
                          ↑ ↓
                      REST APIs
                          ↑ ↓
┌──────────────────────────────────────────────────────────────┐
│                    TanStack Query Layer                      │
│  • Projects, Runners, Processes                              │
│  • Mutations with cache invalidation                         │
│  • 30s stale time                                            │
└──────────────────────────────────────────────────────────────┘
          ↑                    ↑                    ↑
          │                    │                    │
┌─────────┴─────────┐  ┌──────┴──────┐  ┌─────────┴─────────┐
│    Zustand        │  │ TanStack DB │  │   React State    │
│  • Chat messages  │  │ • File trees│  │ • Form inputs    │
│  • UI state       │  │ • Logs      │  │ • Modals         │
│  • Ephemeral      │  │ • History   │  │ • Local UI       │
└───────────────────┘  └─────────────┘  └───────────────────┘
```

**Decision Matrix:**

| Data Type | Tool | Reason |
|-----------|------|--------|
| Projects | TanStack Query | Fetched from API, cached |
| Runners | TanStack Query | Polled every 10s |
| Messages (session) | Zustand | Fast updates, ephemeral OK |
| Messages (persistent) | TanStack Query hydrates Zustand | Load on mount |
| File trees | TanStack DB | 1000+ files, complex filtering |
| Logs | TanStack DB | 10k+ lines, instant search |
| Build history | TanStack DB | Complex queries |
| Form state | React useState | Truly local, no sharing |

---

## Recommended Pattern for SentryVibe

### For Your Current Needs: Pattern 1 (Zustand + Query)

```typescript
// 1. TanStack Query fetches from PostgreSQL
const { data: messagesFromDB } = useProjectMessages(projectId);

// 2. Hydrate Zustand on mount
useEffect(() => {
  if (messagesFromDB) {
    hydrateProject(projectId, messagesFromDB);
  }
}, [messagesFromDB, projectId]);

// 3. Zustand provides fast updates during session
const messages = useMessageStore(s => s.getCurrentMessages(projectId));
const upsertMessage = useMessageStore(s => s.upsertMessage);

// 4. Streaming updates go to Zustand (instant UI)
upsertMessage(projectId, streamingMessage);

// 5. API saves to PostgreSQL (async)
await fetch('/api/chat', { method: 'POST', body: JSON.stringify(message) });

// 6. On project switch: Refetch from PostgreSQL
// TanStack Query cache provides instant loading
```

### Why This Works Best:

✅ **Leverages existing TanStack Query** - Already set up
✅ **Simple sync pattern** - Load → Hydrate → Update → Save
✅ **Fast UI** - Zustand provides instant updates
✅ **Persistent** - PostgreSQL stores everything
✅ **Low complexity** - Clear data flow
✅ **No new dependencies** - Zustand already installed

### Implementation Steps:

1. **Week 1: Create Zustand store** (see Pattern 1 code above)
2. **Week 1: Add hydration logic** (useEffect + TanStack Query)
3. **Week 2: Migrate streaming updates** (replace setMessages with upsertMessage)
4. **Week 2: Test sync** (verify messages persist across sessions)

**Total time:** 2 weeks
**Risk:** Low
**Benefit:** Huge improvement over current useState approach

---

## Advanced: Real-Time Multi-User Sync

### If You Need Collaboration (Future)

**Option A: Server-Sent Events (Current approach)**

```typescript
// Extend current SSE for message updates
const eventSource = new EventSource(`/api/projects/${projectId}/message-stream`);

eventSource.onmessage = (event) => {
  const message = JSON.parse(event.data);

  // Update Zustand when other users send messages
  useMessageStore.getState().upsertMessage(projectId, message);

  // Or update TanStack DB collection
  messageCollection.update(message.id, message);
};
```

**Option B: ElectricSQL + TanStack DB**

```typescript
// Real-time sync with conflict resolution
const messageCollection = createElectricCollection({
  shape: {
    url: 'http://localhost:3000/v1/shape/messages',
    table: 'messages',
    where: `project_id = '${projectId}'`,
  },
});

// Automatic sync across all clients
// No manual SSE needed
```

---

## Data Flow Diagram

### Pattern 1: Zustand + TanStack Query

```
User Action (Send Message)
    ↓
Zustand Store (Optimistic Update) ← Instant UI Update
    ↓
POST /api/chat
    ↓
PostgreSQL (Save Message)
    ↓
TanStack Query (Invalidate Cache)
    ↓
(Optional) Refetch & Re-hydrate Zustand
```

### Pattern 2: TanStack DB

```
User Action (Send Message)
    ↓
messageCollection.insert() ← Instant UI Update (Optimistic)
    ↓
onInsert Handler → POST /api/messages
    ↓
PostgreSQL (Save Message)
    ↓
Live Query (Automatic Re-render)
```

### Pattern 3: Streaming Updates

```
User Sends Message
    ↓
Zustand/DB (Add User Message) ← Instant
    ↓
POST /api/chat (Streaming Response)
    ↓
For each chunk:
  ↓
  Zustand/DB (Upsert Assistant Message) ← Instant Update
  ↓
  React Re-renders ← See typing effect
    ↓
PostgreSQL (API saves final message)
    ↓
Done ← Message persisted
```

---

## FAQ

### Q: Do I need to persist every message update during streaming?

**A:** No! During streaming:
1. Update Zustand/DB for instant UI (ephemeral)
2. Only save **final message** to PostgreSQL
3. On reload: Fetch final message from DB

**Pattern:**
```typescript
// Streaming - Update Zustand only
upsertMessage(projectId, { ...msg, content: msg.content + chunk });

// Stream complete - Save to PostgreSQL
await fetch('/api/messages', {
  method: 'POST',
  body: JSON.stringify(finalMessage),
});
```

### Q: What if user refreshes during streaming?

**A:** Message is lost (acceptable):
- Streaming messages are ephemeral by design
- Only completed messages are saved
- User can resend if needed

**Or implement draft persistence:**
```typescript
// Save draft to localStorage
localStorage.setItem(`draft-${projectId}`, JSON.stringify(draftMessage));

// On mount: Restore draft
const draft = localStorage.getItem(`draft-${projectId}`);
if (draft) {
  upsertMessage(projectId, JSON.parse(draft));
}
```

### Q: How to handle conflicts in multi-user scenarios?

**Zustand approach:** Last-write-wins
```typescript
// User A and User B edit same message
// Last API call wins
// Simple, but can lose data
```

**TanStack DB approach:** Conflict resolution
```typescript
const messageCollection = createElectricCollection({
  onConflict: (local, remote) => {
    if (remote.timestamp > local.timestamp) {
      return remote; // Server wins
    }
    return local; // Client wins
  },
});
```

### Q: Should I use IndexedDB for persistence?

**Current needs:** No, not needed
- Messages fetched from PostgreSQL on mount (fast with TanStack Query cache)
- Zustand ephemeral is fine for session

**Future needs:** Maybe
- If you want offline support
- If you want instant load (no network call)
- TanStack DB can use LocalStorageCollection or IndexedDB

```typescript
import { persist } from 'zustand/middleware';

const useMessageStore = create(
  persist(
    (set) => ({
      // Store definition
    }),
    {
      name: 'message-store',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
```

---

## Conclusion & Recommendation

### For SentryVibe Chat: Pattern 1 (Zustand + TanStack Query)

**Architecture:**
```
PostgreSQL (source of truth)
    ↕ (TanStack Query)
Zustand (fast client cache)
    ↕
React Components
```

**Flow:**
1. On mount: TanStack Query fetches from PostgreSQL
2. Hydrate Zustand with fetched messages
3. During session: All updates go to Zustand (instant)
4. Streaming: Update Zustand as chunks arrive
5. Completed: API saves to PostgreSQL
6. On project switch: Refetch from PostgreSQL

**Benefits:**
✅ Simple, clear data flow
✅ Fast UI (Zustand)
✅ Persistent (PostgreSQL)
✅ Works with existing TanStack Query setup
✅ Low complexity

**Code:**
- See Pattern 1 implementation above
- ~100-150 lines of code
- 2 weeks to implement
- Low risk

**Next Steps:**
1. Create Zustand store with hydration
2. Add TanStack Query integration
3. Migrate streaming updates
4. Test persistence across sessions

---

*Architecture guide completed November 1, 2025*
