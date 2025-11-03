# Remove TanStack DB - Get Live Updates Working

**Goal:** Remove TanStack DB, keep TanStack Query, get live updates working again

**Estimated Time:** 30-45 minutes

---

## 🔄 What We'll Revert

### Remove TanStack DB (15 minutes)

**1. Uninstall packages:**
```bash
pnpm remove @tanstack/db @tanstack/react-db @tanstack/query-db-collection
```

**2. Delete files:**
- `src/collections/` (entire directory)
- `src/components/ChatInterface.tsx` (TanStack DB specific)
- `src/app/db-provider.tsx`
- `src/types/messages.ts` (if only used by DB)

**3. Remove imports in page.tsx:**
- Remove: `import { messageCollection, upsertMessage } from '@/collections'`
- Remove: `const ChatInterface = dynamic(...)`

**4. Remove from layout.tsx:**
- Remove: `<DBInitializer />`

---

## ✅ What We'll Keep & Fix

### Keep TanStack Query (Working Great!)

**Already working:**
- 11 query hooks
- 10 mutation hooks
- SSE integration
- Optimistic updates
- Smart caching

**Keep all of:**
- `src/queries/` directory
- `src/mutations/` directory
- `src/hooks/useProjectStatusSSE.ts`
- `src/app/providers.tsx` (QueryClient)
- Context refactoring (ProjectContext, RunnerContext)

---

### Fix Live Updates (15 minutes)

**Current issue:** Messages_LEGACY works during generation but backend format mismatch

**Solution:** Use existing useState + backend persistence

**What's Already Working:**
```typescript
// Live updates
const [messages, setMessages] = useState<Message[]>([]);

// Stream handler
if (data.type === 'start') {
  setMessages(prev => [...prev, newMessage]);
}
if (data.type === 'text-delta') {
  setMessages(prev => prev.map(m =>
    m.id === currentId ? { ...m, content: m.content + delta } : m
  ));
}
```

**This already works! Just need to:**
1. Re-enable the setMessages code (it's there)
2. Remove TanStack DB fallback logic
3. Use messages state directly

---

### Fix Persistence Loading (15 minutes)

**Current:** Backend saves in old format, API filters it wrong

**Options:**

**Option A: Fix API Parsing (Simplest)**
- Improve /api/messages GET parsing
- Extract text from old format correctly
- Don't filter out assistant messages

**Option B: Update Backend Format**
- Change build route to save simple format
- Match new Message structure
- Clean data from source

**Option C: Use Existing /api/projects/[id]/messages**
- Already loads messages correctly
- Switch to this endpoint
- Keep existing parsing logic

**Recommendation:** Option C (use existing endpoint)

---

## 📋 Step-by-Step Plan

### Phase 1: Remove TanStack DB (15 min)

1. Uninstall packages
2. Delete directories/files
3. Remove imports
4. Test build

---

### Phase 2: Restore Live Updates (15 min)

1. Remove ChatInterface component usage
2. Put back old message rendering (we have it)
3. Ensure setMessages works for streaming
4. Test live generation

---

### Phase 3: Fix Persistence (15 min)

1. Either:
   - Fix API parsing, OR
   - Use /api/projects/[id]/messages endpoint
2. Load messages on project switch
3. Test refresh shows messages

---

## ⏱️ Total Time: 30-45 minutes

**Result:**
- ✅ TanStack Query working (keeps all benefits)
- ✅ Live updates working (existing code)
- ✅ Persistence working (backend already does it)
- ✅ No TanStack DB complexity
- ✅ -40KB bundle size
- ✅ Simpler, maintainable

---

## 🎯 What You Get Back

**Immediately working:**
- Live chat updates during generation
- Messages persist via backend
- Messages load on refresh
- Clean, simple code

**You keep:**
- All TanStack Query benefits (huge!)
- Optimistic updates
- Smart caching
- SSE real-time
- 140 lines removed

**You lose:**
- TanStack DB (wasn't providing value anyway)
- 40KB bundle overhead
- Complexity and debugging time

---

## 🚀 Ready to Execute?

**I can do this in 30-45 minutes:**
1. Revert TanStack DB commits
2. Restore working message state
3. Fix persistence loading
4. Test everything works

**Say the word and I'll get live updates working quickly.**

---

*Removal plan November 3, 2025*
