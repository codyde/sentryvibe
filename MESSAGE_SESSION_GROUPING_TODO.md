# Message-to-Session Grouping TODO

## Problem

Messages (including "Build Plan" responses) are not associated with build sessions in the database. This causes all messages to show chronologically instead of being grouped with their respective builds.

### Current Behavior
```
Chat View:
  User: "Build a landing page"
  Assistant: "Here's the build plan..."
  User: "Switch to dark mode"  
  Assistant: "Here's the updated plan..."
  
Build View:
  [BuildProgress - Initial build]
  [BuildProgress - Follow-up build]
```

### Desired Behavior
```
Initial Request:
  User: "Build a landing page"
  Assistant: "Here's the build plan..."
  [BuildProgress - Initial build]

Follow-up 1:
  User: "Switch to dark mode"
  Assistant: "Here's the updated plan..."
  [BuildProgress - Follow-up build]
```

## Root Cause

**Database Schema:**
```sql
-- messages table (current)
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
  -- ❌ NO sessionId field!
);

-- generation_sessions table
CREATE TABLE generation_sessions (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  build_id TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  ...
);
```

Messages have no way to know which build session they belong to.

## Proper Solution (Database Migration Required)

### Step 1: Add sessionId to messages table

```sql
-- Migration: Add session_id column
ALTER TABLE messages 
ADD COLUMN session_id UUID REFERENCES generation_sessions(id) ON DELETE CASCADE;

-- Add index for performance
CREATE INDEX messages_session_id_idx ON messages(session_id);
```

### Step 2: Update message creation to include sessionId

**In persistent-event-processor.ts:**
```typescript
// When saving assistant messages, include sessionId
await db.insert(messages).values({
  projectId,
  sessionId,  // ✅ Add this
  role: 'assistant',
  content: messageContent,
  createdAt: new Date(),
});
```

**In frontend (page.tsx):**
```typescript
// When user sends message, associate with active session
await saveMessageMutation.mutateAsync({
  projectId,
  sessionId: generationState?.id,  // ✅ Add this
  content: prompt,
  role: 'user',
});
```

### Step 3: Update messages route to return messages grouped by session

**In messages/route.ts:**
```typescript
// Return messages grouped by session
const sessionsWithMessages = sessions.map(session => ({
  ...session,
  messages: projectMessages.filter(msg => msg.sessionId === session.id),
  hydratedState: { ... },
}));
```

### Step 4: Update frontend to render messages per session

**In page.tsx:**
```typescript
// Render messages grouped with their builds
{sessionsWithRelations.map((session, index) => (
  <div key={session.id}>
    <h3>{index === 0 ? 'Initial Request' : `Follow-up ${index}`}</h3>
    
    {/* Messages for this session */}
    {session.messages.map(msg => (
      <MessageCard key={msg.id} message={msg} />
    ))}
    
    {/* Build progress for this session */}
    <BuildProgress state={session.hydratedState} />
  </div>
))}
```

## Temporary Workaround (Timestamp-Based Inference)

Until the database migration is done, we can infer message-to-session relationships using timestamps:

```typescript
function associateMessagesWithSessions(
  messages: Message[],
  sessions: GenerationSession[]
): Map<string, Message[]> {
  const messagesBySession = new Map<string, Message[]>();
  
  // Sort sessions by start time (newest first)
  const sortedSessions = [...sessions].sort((a, b) => 
    b.startedAt.getTime() - a.startedAt.getTime()
  );
  
  messages.forEach(msg => {
    // Find the session this message belongs to
    // Messages belong to the session that started most recently BEFORE the message
    const session = sortedSessions.find(s => 
      s.startedAt.getTime() <= msg.createdAt.getTime()
    );
    
    if (session) {
      const sessionMessages = messagesBySession.get(session.id) || [];
      sessionMessages.push(msg);
      messagesBySession.set(session.id, sessionMessages);
    }
  });
  
  return messagesBySession;
}
```

**Limitations:**
- ❌ Relies on timestamp ordering (fragile)
- ❌ Breaks if clocks are skewed
- ❌ Can't handle messages sent before any session
- ✅ Works as stopgap until proper fix

## Migration Plan

1. **Create migration file:** `drizzle/add_session_id_to_messages.sql`
2. **Update schema:** `packages/agent-core/src/lib/db/schema.ts`
3. **Update message creation:** All places that insert messages
4. **Update queries:** Return messages grouped by session
5. **Update frontend:** Render grouped messages
6. **Test thoroughly:** Ensure old messages work (sessionId = null)

## Testing Checklist

After implementing:

- [ ] Initial build messages group with initial build
- [ ] Follow-up messages group with follow-up build
- [ ] Multiple follow-ups each get their own message groups
- [ ] Old messages (before migration) still display correctly
- [ ] Hard refresh preserves grouping
- [ ] WebSocket updates don't break grouping

## Estimated Effort

- Database migration: 30 minutes
- Code updates: 2 hours
- Testing: 1 hour
- **Total: ~3.5 hours**

## Priority

**HIGH** - This is a core UX issue that confuses users about which messages belong to which build.

## References

- Schema: `packages/agent-core/src/lib/db/schema.ts`
- Message saving: `packages/agent-core/src/lib/runner/persistent-event-processor.ts`
- Message display: `apps/sentryvibe/src/app/page.tsx`
- Messages API: `apps/sentryvibe/src/app/api/projects/[id]/messages/route.ts`

