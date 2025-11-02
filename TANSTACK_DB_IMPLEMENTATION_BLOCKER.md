# TanStack DB Implementation - Critical Finding

**Date:** November 1, 2025
**Status:** ⚠️ **BLOCKER DISCOVERED**

---

## Issue Discovered

While implementing TanStack DB, I discovered the **actual API is significantly more complex** than the documentation suggests:

### Problem 1: QueryClient Required

```typescript
// queryCollectionOptions REQUIRES QueryClient instance
const messageCollection = createCollection(
  queryCollectionOptions({
    queryClient: queryClient, // ← Must provide this
    queryKey: ['messages'],
    queryFn: fetchMessages,
    // ...
  })
);
```

**This means:** Collections can't be global singletons defined at module level - they need access to QueryClient from React context.

### Problem 2: No Simple Provider

- No `DBProvider` export from `@tanstack/react-db`
- Collections must be created inside React components (to access QueryClient)
- Can't define collections once and import everywhere

### Problem 3: API Complexity

The actual signature is much more complex than docs suggest:
- Handler signatures don't match documentation
- TypeScript errors with provided examples
- Beta status showing through incomplete types

---

## What This Means

### TanStack DB is MORE complex than expected

**Original assumption:**
```typescript
// Define collection once (global singleton)
export const messageCollection = createCollection({...});

// Use anywhere
const { data } = useLiveQuery((q) => q.from({ message: messageCollection }));
```

**Reality:**
```typescript
// Must create collection in React component (to access QueryClient)
function MyComponent() {
  const queryClient = useQueryClient();

  const [messageCollection] = useState(() =>
    createCollection(queryCollectionOptions({
      queryClient, // Required!
      queryKey: ['messages'],
      queryFn: fetchMessages,
    }))
  );

  const { data } = useLiveQuery((q) => q.from({ message: messageCollection }));
}
```

**This breaks the global singleton pattern** and makes it much more complex.

---

## Revised Recommendation

### 🔄 Back to Zustand

**Given these findings, I'm reversing my recommendation:**

✅ **Use Zustand for client state** (chat, UI, etc.)
✅ **Keep TanStack Query** (API calls, already working great)
❌ **Skip TanStack DB** for now - too complex for production use

### Why Zustand is Better (Now)

1. **Simpler API** - Works as expected, no surprises
2. **Already installed** - Zero bundle cost
3. **Proven pattern** - Global stores, import anywhere
4. **Quick implementation** - 3-4 hours vs weeks of debugging
5. **Production ready** - Stable, well-documented
6. **TanStack DB complexity** - Beta showing through, API mismatch

---

## What I Learned

**TanStack DB beta status is real:**
- Documentation doesn't match actual API
- TypeScript types are incomplete
- Requires QueryClient in ways that break singleton pattern
- More complex than advertised

**For SentryVibe:**
- Your TanStack Query implementation is excellent
- Zustand for client state is the pragmatic choice
- TanStack DB needs more maturity

---

## Recommendation: Zustand + TanStack Query

### Clean Architecture

```
PostgreSQL (source of truth)
    ↕
TanStack Query (server state - API calls)
    ↕
Zustand (client state - messages, UI)
    ↕
React Components
```

### Implementation (3-4 hours)

**Create one Zustand store:**
```typescript
const useAppStore = create(immer((set) => ({
  // Messages (per project)
  messagesByProject: {},

  // Generation state (per project)
  generationStateByProject: {},

  // UI state
  uiState: {
    activeTab: 'chat',
    showProcessModal: false,
    commandPaletteOpen: false,
  },

  // Actions
  upsertMessage: (projectId, msg) => set((state) => {
    // Simple, clean updates
  }),

  updateGenerationState: (projectId, updates) => set((state) => {
    // Simple, clean updates
  }),

  toggleModal: (modal) => set((state) => {
    state.uiState[modal] = !state.uiState[modal];
  }),
})));
```

**PostgreSQL sync (manual but simple):**
```typescript
// Hydrate from TanStack Query
const { data } = useProjectMessages(projectId);
useEffect(() => {
  if (data) {
    useAppStore.getState().hydrateMessages(projectId, data);
  }
}, [data, projectId]);

// Save to PostgreSQL
const saveMessage = async (msg) => {
  // 1. Update Zustand (instant)
  useAppStore.getState().upsertMessage(projectId, msg);

  // 2. Save to PostgreSQL (async)
  await fetch('/api/messages', {
    method: 'POST',
    body: JSON.stringify(msg),
  });
};
```

**Clean, simple, works**

---

## Lessons Learned

1. **Beta means beta** - TanStack DB isn't ready for production
2. **Documentation lag** - API doesn't match docs (red flag)
3. **Complexity hidden** - Real implementation much harder than advertised
4. **Pragmatism wins** - Zustand + Query is proven and works

---

## Next Steps

1. ✅ Commit current TanStack Query work (already done)
2. ✅ Remove TanStack DB attempts
3. ✅ Implement Zustand for client state
4. ✅ Keep architecture: Query (server) + Zustand (client)
5. 📅 Revisit TanStack DB in 6-12 months when v1.0 stable

---

## Conclusion

**TanStack DB looked great on paper, but beta implementation issues make it impractical.**

**Zustand + TanStack Query is the right choice:**
- Proven, stable technologies
- Clean separation (Query = server, Zustand = client)
- Quick implementation (hours not weeks)
- Production ready
- Team will thank you

**I apologize for the initial over-enthusiasm about TanStack DB** - should have validated API compatibility before recommending. The beta status is real.

---

*Implementation blocker documented November 1, 2025*
