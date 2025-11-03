# Message Persistence Diagnostic Guide

**PostgreSQL sync IS enabled - let's diagnose why persistence isn't working**

---

## 🔍 Diagnostic Test Sequence

### Test 1: Check Collection Initialization

**Start dev server and look for:**
```
✅ [messageCollection] Initialized with PostgreSQL sync
📥 [messageCollection] Fetching messages from PostgreSQL via /api/messages
✅ [messageCollection] Loaded X messages from PostgreSQL
```

**Questions:**
- Do you see these logs on app start?
- If NO: Collection isn't initializing - check browser console
- If YES: Collection is working, continue to Test 2

---

### Test 2: Check Message Insert

**Send a test message: "Test persistence 1"**

**Look for in console:**
```
💾 [messageCollection] Inserting message to PostgreSQL: <UUID>
✅ [messageCollection] Message inserted to PostgreSQL: <UUID>
```

**Check Network tab:**
- POST /api/messages → Status should be 200 OK
- Response should show inserted message with database-generated data

**Questions:**
- Do you see successful insert logs?
- Is Network request 200 OK or error?
- If 500 error: Check server console for detailed error

---

### Test 3: Check Database Has Data

**After sending message, check if it's in PostgreSQL:**

**Option A: Via API (in browser console):**
```javascript
fetch('/api/messages')
  .then(r => r.json())
  .then(d => console.log('Messages in DB:', d.messages));
```

**Option B: Via database client:**
```sql
SELECT * FROM messages ORDER BY created_at DESC LIMIT 10;
```

**Questions:**
- Are messages actually in the database?
- Do they have correct structure (id, project_id, role, content)?
- If NO: onInsert is failing silently
- If YES: Messages are saving, continue to Test 4

---

### Test 4: Check Message Loading on Refresh

**Refresh browser, look for:**
```
📥 [messageCollection] Fetching messages from PostgreSQL
✅ [messageCollection] Loaded X messages from PostgreSQL
[messageCollection] Sample message: { id, projectId, type, contentPreview }
```

**Then check:**
```
[ChatInterface] Messages updated: {
  fromDB: X,  ← Should be > 0 if loading worked
  fromLegacy: Y,
  using: 'TanStack DB' or 'Legacy',  ← Should be 'TanStack DB'
}
```

**Questions:**
- Does it fetch messages on refresh?
- Are X messages loaded from DB?
- Is ChatInterface using 'TanStack DB' or 'Legacy'?

---

## 🎯 Diagnostic Decision Tree

### Scenario A: No Collection Initialization Logs

**Symptoms:**
- Don't see "Initialized with PostgreSQL sync"
- Don't see "Fetching messages from PostgreSQL"

**Cause:** Collection not initializing

**Check:**
- Is `typeof window !== 'undefined'` true?
- Is there a JavaScript error preventing initialization?
- Check browser console for errors

---

### Scenario B: Insert Fails (500 Error)

**Symptoms:**
- See "Inserting message" log
- See "❌ Failed to insert message" error
- Network tab shows 500

**Cause:** API endpoint error

**Check:**
- Server console for exact error
- Likely UUID format issue still
- Or database constraint violation

---

### Scenario C: Insert Succeeds, But Doesn't Load

**Symptoms:**
- See "✅ Message inserted to PostgreSQL"
- Message IS in database (Test 3)
- But on refresh: "Loaded 0 messages"

**Cause:** Query not returning data or filtering wrong

**Check:**
- Does /api/messages return data? (Test with fetch in console)
- Is queryFn running on mount?
- Is there an error in queryFn?

---

### Scenario D: Loads But ChatInterface Uses Legacy

**Symptoms:**
- See "Loaded X messages from PostgreSQL" (X > 0)
- But ChatInterface shows: "using: 'Legacy'"
- messagesFromDB is empty even though query loaded data

**Cause:** useLiveQuery not working or filtering wrong

**Check:**
- Is `currentProjectId` correct?
- Is where clause filtering out all messages?
- Check: `messagesFromDB?.length` in console log

---

## 🔧 Quick Persistence Test

**To test if PostgreSQL persistence works at all:**

**In browser console:**
```javascript
// Test API directly
await fetch('/api/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: crypto.randomUUID(),
    projectId: 'test-project-id',
    type: 'user',
    content: 'Direct API test',
    timestamp: Date.now(),
  })
});

// Then fetch back
fetch('/api/messages')
  .then(r => r.json())
  .then(d => console.log('Messages:', d));
```

**Expected:**
- POST returns 200
- GET returns your test message
- Proves API persistence works

---

## 💡 Most Likely Issues

### Issue #1: QueryCollection Not Fetching on Mount

**Why:** TanStack Query might not trigger query immediately

**Fix:** Add `refetchOnMount: true` or trigger manually

---

### Issue #2: Messages Filtered Out by useLiveQuery

**Why:** where clause filters to `currentProjectId` - might be undefined/wrong

**Debug:**
```javascript
// Check what project ID is being used
console.log('Current project ID:', currentProjectId);

// Check all messages in collection
messageCollection.getAll();
```

---

### Issue #3: Fallback Logic Too Aggressive

**Current:**
```typescript
const messages = messagesFromDB?.length > 0 ? messagesFromDB : messages_LEGACY;
```

**Issue:** If `messagesFromDB` is `[]` (empty array, not undefined), it's truthy but length is 0, so falls back to legacy

**Should maybe be:**
```typescript
const messages = messagesFromDB !== undefined ? messagesFromDB : messages_LEGACY;
```

---

## 🧪 What to Test

**Start dev server and:**

1. **Check console on load** - Do you see fetch logs?
2. **Send message** - Do you see insert logs + 200 OK?
3. **Check `/api/messages` directly** - Are messages there?
4. **Refresh** - Do you see load logs? What count?
5. **Check ChatInterface log** - Using DB or Legacy?

**Report back these console logs and I can pinpoint the exact issue!**

---

*Diagnostic guide November 2, 2025*
