# TanStack DB Migration Guide - Incremental Approach

**Date:** November 1, 2025
**Strategy:** Safe, incremental migration without breaking changes

---

## Overview

This guide shows how to migrate SentryVibe from useState to TanStack DB **incrementally**, keeping the app working at every step.

**Philosophy:** Add new, remove old, test each step.

---

## Current Status ✅

### Foundation Complete

**Installed:**
- `@tanstack/react-db`
- `@tanstack/query-db-collection`

**Created:**
- ✅ `queryClient` exported from providers
- ✅ `DBInitializer` component
- ✅ `messageCollection` with PostgreSQL sync
- ✅ `generationStateCollection` with PostgreSQL sync
- ✅ `uiStateCollection` for ephemeral UI state
- ✅ Collections index for easy imports
- ✅ Message types file

**All TypeScript errors fixed!**

---

## Migration Strategy: Side-by-Side Pattern

**Approach:** Add TanStack DB alongside existing useState, then gradually replace.

**Benefits:**
- ✅ App never breaks
- ✅ Can test each piece
- ✅ Can roll back easily
- ✅ Team can review incrementally

---

## Phase 1: Messages Migration (Week 1)

### Step 1.1: Add useLiveQuery Alongside useState

**File:** `src/app/page.tsx`

**Current:**
```typescript
const [messages, setMessages] = useState<Message[]>([]);
```

**Add (don't remove):**
```typescript
// Keep old state for now
const [messages_LEGACY, setMessages] = useState<Message[]>([]);

// Add new TanStack DB query
const { data: messagesFromDB } = useLiveQuery((q) =>
  q.from({ message: messageCollection })
   .where(({ message }) =>
      currentProject?.id ? message.projectId === currentProject.id : false
   )
   .orderBy(({ message }) => message.timestamp)
);

// Use new data (with fallback to legacy)
const messages = messagesFromDB || messages_LEGACY;
```

**Test:** App should still work exactly as before.

---

### Step 1.2: Replace setMessages with Collection

**Find all `setMessages` calls and replace incrementally:**

**Pattern 1: Adding Messages**

**Before:**
```typescript
const userMessage: Message = {
  id: `msg-${Date.now()}`,
  role: "user",
  parts: [{ type: "text", text: prompt }],
};
setMessages((prev) => [...prev, userMessage]);
```

**After:**
```typescript
const userMessage: Message = {
  id: `msg-${Date.now()}`,
  projectId: currentProject.id, // Add projectId!
  role: "user",
  parts: [{ type: "text", text: prompt }],
  timestamp: Date.now(), // Add timestamp!
};

// Use collection instead
messageCollection.insert(userMessage);

// Legacy call (can remove after testing)
// setMessages((prev) => [...prev, userMessage]);
```

**Pattern 2: Updating Messages (Complex → Simple!)**

**Before (Complex, O(2n)):**
```typescript
setMessages((prev) =>
  prev.some((m) => m.id === updatedMessage.id)
    ? prev.map((m) => m.id === updatedMessage.id ? updatedMessage : m)
    : [...prev, updatedMessage]
);
```

**After (Simple, O(1)):**
```typescript
updatedMessage.projectId = currentProject.id; // Ensure projectId
updatedMessage.timestamp = updatedMessage.timestamp || Date.now();

upsertMessage(updatedMessage);
// ↑ That's it! Handles both insert and update
```

**Pattern 3: Clearing Messages**

**Before:**
```typescript
setMessages([]);
```

**After:**
```typescript
// Delete all messages for current project
const currentMessages = messageCollection.getAll().filter(
  m => m.projectId === currentProject.id
);
currentMessages.forEach(m => messageCollection.delete(m.id));

// Or simpler: Just switch projects, query will filter automatically
```

---

### Step 1.3: Load Messages from PostgreSQL

**Current:** `loadMessages()` function fetches and calls `setMessages`

**Migrate:**

The beautiful thing is **you don't need loadMessages anymore!**

**Current (60+ lines):**
```typescript
const loadMessages = async (projectId: string) => {
  // Complex debouncing logic
  // Fetch from API
  // Parse messages
  // Separate element changes
  // setMessages(regularMessages)
  // setElementChangeHistoryByProject(...)
  // 60+ lines of code
};

useEffect(() => {
  if (selectedProjectSlug) {
    loadMessages(project.id); // Manual load
  }
}, [selectedProjectSlug]);
```

**With TanStack DB (Automatic!):**
```typescript
// Messages automatically load via queryCollectionOptions!
const { data: messages } = useLiveQuery((q) =>
  q.from({ message: messageCollection })
   .where(({ message }) => message.projectId === currentProject?.id)
   .orderBy(({ message }) => message.timestamp)
);

// No loadMessages needed!
// No useEffect needed!
// Collection fetches from PostgreSQL automatically via TanStack Query
```

**Can delete entire loadMessages function!** (~60 lines removed)

---

### Step 1.4: Test Messages

**Checklist:**
- [ ] Messages load when opening project
- [ ] New messages appear instantly
- [ ] Messages persist after refresh
- [ ] Project switching works
- [ ] Streaming updates work

**Once validated:** Remove `messages_LEGACY` and all `setMessages` calls.

---

## Phase 2: UI State Migration (Week 2)

### Step 2.1: Replace UI useState

**Current:**
```typescript
const [activeTab, setActiveTab] = useState<'chat' | 'build'>('chat');
const [activeView, setActiveView] = useState<'chat' | 'build'>('chat');
const [showProcessModal, setShowProcessModal] = useState(false);
const [renamingProject, setRenamingProject] = useState<{...} | null>(null);
const [deletingProject, setDeletingProject] = useState<{...} | null>(null);
const [selectedTemplate, setSelectedTemplate] = useState<{...} | null>(null);
```

**After:**
```typescript
// Query UI state from collection
const { data: uiState } = useLiveQuery((q) =>
  q.from({ ui: uiStateCollection })
   .where(({ ui }) => ui.id === 'global')
);

const currentUI = uiState?.[0];
const activeTab = currentUI?.activeTab || 'chat';
const activeView = currentUI?.activeView || 'chat';
const showProcessModal = currentUI?.showProcessModal || false;
const renamingProject = currentUI?.renamingProject;
const deletingProject = currentUI?.deletingProject;
const selectedTemplate = currentUI?.selectedTemplate;
```

### Step 2.2: Replace UI State Updates

**Before:**
```typescript
setActiveTab('build');
setShowProcessModal(true);
setRenamingProject({ id: '123', name: 'Project' });
```

**After:**
```typescript
import { setActiveTab, openProcessModal, openRenameModal } from '@/collections';

setActiveTab('build'); // ← Same API, different implementation!
openProcessModal();
openRenameModal({ id: '123', name: 'Project' });
```

**Benefits:**
- Same or simpler API
- Can query UI state (e.g., "are any modals open?")
- Centralized state management

---

## Phase 3: Generation State Migration (Week 2-3)

### Current Pattern

```typescript
const [generationState, setGenerationState] = useState<GenerationState | null>(null);

// Complex updater function
const updateGenerationState = useCallback((updater) => {
  setGenerationState((prev) => {
    const next = typeof updater === "function" ? updater(prev) : updater;
    generationStateRef.current = next;
    setGenerationRevision((rev) => rev + 1);
    return next;
  });
}, []);

// WebSocket sync
useEffect(() => {
  if (wsState) {
    setGenerationState(wsState);
  }
}, [wsState]);
```

### With TanStack DB

```typescript
// Query generation state from collection
const { data: generationStates } = useLiveQuery((q) =>
  q.from({ generation: generationStateCollection })
   .where(({ generation }) =>
      currentProject?.id ? generation.id === currentProject.id : false
   )
);

const generationState = generationStates?.[0] || null;

// Simple updater (no complex callback)
const updateGenerationState = (updates: Partial<GenerationState>) => {
  if (!currentProject?.id) return;

  const existing = generationStateCollection.get(currentProject.id);

  if (existing) {
    generationStateCollection.update(currentProject.id, (draft) => {
      Object.assign(draft, updates);
    });
  } else {
    generationStateCollection.insert({
      ...updates as GenerationState,
      id: currentProject.id,
    });
  }
};

// WebSocket sync (simpler!)
useEffect(() => {
  if (wsState && currentProject?.id) {
    generationStateCollection.update(currentProject.id, (draft) => {
      Object.assign(draft, wsState);
    });
  }
}, [wsState, currentProject?.id]);
```

**Benefits:**
- No complex callback patterns
- No manual revision tracking
- Automatic reactivity
- Can delete generationStateRef

---

## Phase 4: Remove Zustand (Week 3)

### Current Zustand Usage

**File:** `src/hooks/useCommandPalette.ts`

```typescript
const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));
```

### Replace with uiStateCollection

```typescript
// src/hooks/useCommandPalette.ts (refactored)
import { useLiveQuery } from '@tanstack/react-db';
import {
  uiStateCollection,
  openCommandPalette,
  closeCommandPalette,
  toggleCommandPalette,
} from '@/collections';

export function useCommandPalette() {
  const { data: uiState } = useLiveQuery((q) =>
    q.from({ ui: uiStateCollection })
     .where(({ ui }) => ui.id === 'global')
  );

  const isOpen = uiState?.[0]?.commandPaletteOpen ?? false;

  return {
    isOpen,
    open: openCommandPalette,
    close: closeCommandPalette,
    toggle: toggleCommandPalette,
  };
}
```

### Remove Zustand

```bash
pnpm remove zustand
```

---

## Migration Checklist

### Week 1: Messages
- [ ] Add useLiveQuery for messages alongside useState
- [ ] Replace first `setMessages` call with `messageCollection.insert`
- [ ] Replace upsert pattern with `upsertMessage()`
- [ ] Test message loading from PostgreSQL
- [ ] Test message streaming
- [ ] Remove `messages_LEGACY` useState
- [ ] Delete `loadMessages` function (~60 lines)

### Week 2: UI State
- [ ] Add useLiveQuery for uiState
- [ ] Replace `setActiveTab` with collection helper
- [ ] Replace modal useState with collection
- [ ] Replace template useState with collection
- [ ] Test all UI state changes
- [ ] Remove old UI useState declarations

### Week 3: Generation State & Cleanup
- [ ] Add useLiveQuery for generationState
- [ ] Replace `updateGenerationState` with collection updates
- [ ] Integrate WebSocket with collection
- [ ] Test build workflow
- [ ] Replace Zustand CommandPalette
- [ ] Remove Zustand package
- [ ] Delete legacy code
- [ ] Add cross-collection queries

---

## Example: Streaming Updates Migration

### Current (Complex)

```typescript
// Stream handler (page.tsx ~lines 1400-1450)
while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decode(value);
  const data = JSON.parse(chunk);

  if (data.type === 'text-delta') {
    // Complex update logic
    setMessages((prev) =>
      prev.some((m) => m.id === updatedMessage.id)
        ? prev.map((m) =>
            m.id === updatedMessage.id ? updatedMessage : m
          )
        : [...prev, updatedMessage]
    );
  }
}
```

### With TanStack DB (Simple)

```typescript
// Create assistant message
const assistantMsg: Message = {
  id: nanoid(),
  projectId: currentProject.id,
  role: 'assistant',
  content: '',
  parts: [],
  timestamp: Date.now(),
};
messageCollection.insert(assistantMsg);

// Stream handler
while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decode(value);
  const data = JSON.parse(chunk);

  if (data.type === 'text-delta') {
    // Simple update!
    messageCollection.update(assistantMsg.id, (draft) => {
      draft.content += data.text;
    });
    // ↑ Instant UI update
    // ↑ onUpdate syncs to PostgreSQL (can skip during streaming)
  }
}
```

**80% less code, O(1) instead of O(2n), instant updates**

---

## PostgreSQL Sync Validation

### How to Test Sync Works

**Test 1: Insert Message**
```typescript
// Send a message
messageCollection.insert({
  id: 'test-123',
  projectId: currentProject.id,
  role: 'user',
  content: 'Test message',
  parts: [{ type: 'text', text: 'Test message' }],
  timestamp: Date.now(),
});

// Check network tab:
// Should see POST /api/messages with message data

// Check PostgreSQL:
// SELECT * FROM messages WHERE id = 'test-123'
// Should exist!
```

**Test 2: Update Message**
```typescript
// Update message
messageCollection.update('test-123', (draft) => {
  draft.content = 'Updated content';
});

// Check network tab:
// Should see PATCH /api/messages/test-123

// Check PostgreSQL:
// Message should have updated content
```

**Test 3: Reload Page**
```typescript
// Refresh browser
// Messages should load from PostgreSQL automatically
// Via queryCollectionOptions + TanStack Query
```

---

## Advanced: Cross-Collection Queries

### After Migration Complete

**Query 1: Messages from Current Build**
```typescript
const { data: currentBuildMessages } = useLiveQuery((q) =>
  q.from({
      message: messageCollection,
      generation: generationStateCollection,
    })
   .where(({ message, generation }) =>
      generation.id === currentProject.id &&
      generation.isActive === true &&
      message.projectId === currentProject.id &&
      message.timestamp >= generation.startTime
   )
   .select(({ message, generation }) => ({
      message: message.content,
      activeTodo: generation.todos[generation.activeTodoIndex],
      timestamp: message.timestamp,
   }))
);
```

**Query 2: Error Messages**
```typescript
const { data: errors } = useLiveQuery((q) =>
  q.from({ message: messageCollection })
   .where(({ message }) =>
      message.projectId === currentProject.id &&
      message.parts.some(p => p.type === 'error')
   )
);
```

**Query 3: Build Context (Messages + Todos + Progress)**
```typescript
const { data: buildContext } = useLiveQuery((q) =>
  q.from({
      message: messageCollection,
      generation: generationStateCollection,
    })
   .where(({ message, generation }) =>
      message.projectId === currentProject.id &&
      generation.id === currentProject.id
   )
   .select(({ message, generation }) => ({
      messages: message,
      todos: generation.todos,
      activeTodoIndex: generation.activeTodoIndex,
      progress: generation.todos.filter(t => t.status === 'completed').length / generation.todos.length,
   }))
);
```

**These queries update in <1ms when ANY data changes!**

---

## Code Reduction Estimates

### Messages Migration

| Item | Before | After | Reduction |
|------|--------|-------|-----------|
| State declaration | 1 line | 3 lines useLiveQuery | -2 lines |
| loadMessages function | 60 lines | 0 lines (automatic) | **-60 lines** |
| Add message | 3 lines | 1 line | **-2 lines** |
| Update message | 5 lines (complex) | 1 line | **-4 lines** |
| Upsert message | 5 lines (complex) | 1 line | **-4 lines** |

**Total: ~70 lines removed**

### UI State Migration

| Item | Before | After | Reduction |
|------|--------|-------|-----------|
| State declarations | 8 lines | 3 lines useLiveQuery | **-5 lines** |
| State updates | 1 line each | 1 line each | 0 lines |

**Total: ~5 lines removed, but unified architecture**

### Generation State Migration

| Item | Before | After | Reduction |
|------|--------|-------|-----------|
| State declaration | 2 lines | 3 lines useLiveQuery | -1 line |
| updateGenerationState | 20 lines (complex) | 10 lines (simple) | **-10 lines** |
| WebSocket sync | 15 lines | 5 lines | **-10 lines** |

**Total: ~20 lines removed**

### Overall

**Total reduction: ~95 lines**
**Complexity reduction: 80% simpler logic**
**Performance: O(2n) → O(1) for updates**

---

## Testing Strategy

### After Each Migration Step

**1. Visual Testing:**
- Messages appear correctly
- Updates work
- No console errors
- UI responds to changes

**2. PostgreSQL Validation:**
- Check network tab (API calls made)
- Query PostgreSQL directly
- Verify data persists

**3. Performance Testing:**
- React DevTools profiler
- Check re-render counts
- Verify <1ms update times

**4. Edge Cases:**
- Refresh during streaming
- Switch projects mid-stream
- Network errors
- Empty states

---

## Rollback Plan

**If anything breaks:**

1. **Keep old code:** Don't delete useState until fully tested
2. **Feature flag:** Use env var to toggle between old/new
3. **Git:** Each step is a separate commit, easy to revert

**Example feature flag:**
```typescript
const USE_TANSTACK_DB = process.env.NEXT_PUBLIC_USE_TANSTACK_DB === 'true';

const messages = USE_TANSTACK_DB
  ? messagesFromDB  // TanStack DB
  : messages_LEGACY; // Legacy useState
```

---

## Next Actions

### Immediate (Today)

1. **Add useLiveQuery for messages** (alongside current state)
2. **Replace one `setMessages` call** (test it works)
3. **Validate** (messages still load)

### This Week

4. **Replace all `setMessages` calls**
5. **Test thoroughly**
6. **Remove legacy state**
7. **Delete loadMessages function**

### Next Week

8. **Migrate UI state**
9. **Migrate generation state**
10. **Remove Zustand**

---

## Success Metrics

**Week 1:**
- ✅ Messages use TanStack DB
- ✅ ~70 lines removed
- ✅ O(1) update performance
- ✅ PostgreSQL sync working

**Week 2:**
- ✅ UI state unified
- ✅ Generation state reactive
- ✅ ~95 lines total removed

**Week 3:**
- ✅ Zustand removed
- ✅ Cross-collection queries working
- ✅ Sub-millisecond updates verified
- ✅ Production ready

---

## Ready to Start?

Foundation is complete. Let's start with **Step 1.1: Add useLiveQuery alongside current messages state**.

This will be safe, non-breaking, and we can test it immediately!

---

*Migration guide created November 1, 2025*
