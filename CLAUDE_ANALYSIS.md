# Claude Code Configuration Analysis

**Date**: October 27, 2025  
**Status**: Analysis Complete - Issues Identified

## Executive Summary

Your Claude Code implementation is **more stable** than Codex because:
1. ✅ Uses AI SDK's native tool call IDs (no `Date.now()` collisions)
2. ✅ Cleaner event structure (tool-input-start → tool-call → tool-result)
3. ✅ Simpler state management (fewer intermediate transformations)

**However**, it suffers from the **same fundamental page refresh issues** because:
- ❌ Still uses fetch-based SSE (no reconnection)
- ❌ Same dual state management (frontend + database)
- ❌ Same hydration race conditions
- ❌ Same lack of resume capability

---

## Claude vs. Codex: Architecture Comparison

### Claude Code Flow (AI SDK)

```
User request → /api/projects/[id]/build
    ↓
apps/runner/src/index.ts:createClaudeQuery()
    ↓
AI SDK streamText()
    ├─ Uses claudeCode() provider
    ├─ Native tool handling
    └─ result.fullStream yields:
        - text-delta (character-by-character)
        - tool-call (complete with ID from AI SDK)
        - tool-result (automatic execution)
    ↓
apps/runner/src/lib/ai-sdk-adapter.ts:transformAISDKStream()
    ├─ Buffers tool inputs (line 134-148)
    ├─ Emits tool_use with AI SDK's toolCallId (line 153)
    └─ No duplicate tool ID generation!
    ↓
apps/runner/src/lib/message-transformer.ts:transformAgentMessageToSSE()
    ├─ Converts to SSE format
    └─ Sends to frontend
    ↓
Frontend: page.tsx processes events
```

**Key Strength**: AI SDK provides **stable tool IDs** from the API response:
```typescript
// apps/runner/src/lib/ai-sdk-adapter.ts:153
const toolCallId = part.toolCallId || part.id; // AI SDK provides this
```
No `Date.now()` fallback! The AI SDK gets tool IDs directly from Claude's API.

### Codex Flow (Codex SDK)

```
User request → /api/projects/[id]/build
    ↓
apps/runner/src/index.ts:createCodexQuery()
    ↓
Codex SDK thread.runStreamed()
    ├─ Yields item.started (tool begins)
    ├─ Yields item.completed (tool finishes)
    └─ No built-in tool IDs!
    ↓
apps/runner/src/lib/codex-sdk-adapter.ts:transformCodexStream()
    ├─ MUST extract/generate tool IDs (line 82-89)
    ├─ Falls back to Date.now() 🚨
    └─ Tracks tools in Map to match start/complete
    ↓
apps/runner/src/lib/message-transformer.ts:transformAgentMessageToSSE()
    ↓
Frontend: page.tsx processes events
```

**Key Weakness**: Codex SDK doesn't provide stable tool IDs:
```typescript
// apps/runner/src/lib/codex-sdk-adapter.ts:82-89
function getToolId(item: CodexThreadEvent['item']): string {
  if (!item) return `tool-${Date.now()}`; // 🚨 COLLISION RISK
  // ... tries various fields
  return `tool-${Date.now()}`; // 🚨 FALLBACK
}
```

---

## Stability Comparison

| Issue | Claude (AI SDK) | Codex (Codex SDK) | Impact |
|-------|-----------------|-------------------|--------|
| **Tool ID generation** | ✅ Stable (from API) | ❌ `Date.now()` fallback | Codex has duplicate tools |
| **Event structure** | ✅ Clean (tool-call) | ⚠️ Complex (start/complete matching) | Codex more prone to mismatches |
| **Tool buffering** | ✅ Simple (input-start → input-end) | ❌ Manual Map tracking | Codex can lose tool state |
| **Page refresh** | ❌ **Both break** | ❌ **Both break** | **SHARED CRITICAL ISSUE** |
| **Race conditions** | ❌ **Both affected** | ❌ **Both affected** | **SHARED CRITICAL ISSUE** |
| **SSE reconnection** | ❌ **Both lack it** | ❌ **Both lack it** | **SHARED CRITICAL ISSUE** |

---

## Claude-Specific Issues Found

### 1. No Message ID Tracking in AI SDK Adapter

**Problem**: The AI SDK adapter doesn't consistently track message IDs:

```typescript
// apps/runner/src/lib/ai-sdk-adapter.ts:70
let currentMessageId: string = `msg-${Date.now()}`; // Default fallback

// Line 106-109: Updates from 'start' events
if (part.id) {
  currentMessageId = part.id;
}

// Line 114-117: Updates from 'text-start' events
if (part.id) {
  currentMessageId = part.id;
}
```

**Issue**: Multiple places can update `currentMessageId`, and it uses `Date.now()` as fallback (though less critical than tool IDs).

**Recommendation**: Use `randomUUID()` for consistency:
```typescript
let currentMessageId: string = `msg-${randomUUID()}`;
```

---

### 2. Tool Input Buffering Complexity

The AI SDK emits tool inputs in chunks:

```typescript
// apps/runner/src/lib/ai-sdk-adapter.ts:134-166
case 'tool-input-start':
  toolInputBuffer.set(part.id, { name: part.toolName, input: '' });
  break;

case 'tool-input-delta':
  const buffer = toolInputBuffer.get(part.id);
  if (buffer) {
    buffer.input += part.delta || '';
  }
  break;

case 'tool-input-end':
case 'tool-call':
  // Parse buffered input as JSON
  if (!toolInput && toolInputBuffer.has(toolCallId)) {
    const buffered = toolInputBuffer.get(toolCallId)!;
    try {
      toolInput = JSON.parse(buffered.input);
    } catch {
      toolInput = { raw: buffered.input }; // Fallback
    }
    toolInputBuffer.delete(toolCallId);
  }
```

**Potential Issue**: If `tool-input-end` event is missed or delayed:
- Buffer grows indefinitely
- JSON parsing might fail on incomplete input
- Tool call might emit with partial input

**Risk**: Medium - unlikely but possible during network issues

**Fix**: Add timeout cleanup for stale buffers:
```typescript
const BUFFER_TIMEOUT = 30000; // 30 seconds
const bufferTimestamps = new Map<string, number>();

case 'tool-input-start':
  toolInputBuffer.set(part.id, { name: part.toolName, input: '' });
  bufferTimestamps.set(part.id, Date.now());
  break;

// Cleanup stale buffers periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, timestamp] of bufferTimestamps.entries()) {
    if (now - timestamp > BUFFER_TIMEOUT) {
      toolInputBuffer.delete(id);
      bufferTimestamps.delete(id);
      console.warn(`[ai-sdk-adapter] Cleaned up stale buffer: ${id}`);
    }
  }
}, 10000); // Check every 10 seconds
```

---

### 3. Text Content Accumulation

**Observation**: Text is accumulated in a single string:

```typescript
// apps/runner/src/lib/ai-sdk-adapter.ts:120-132
case 'text-delta':
  const textChunk = part.delta ?? part.text ?? part.textDelta;
  if (typeof textChunk === 'string') {
    currentTextContent += textChunk; // String concatenation
    
    if (part.id) {
      currentMessageId = part.id;
    }
  }
  break;
```

**Potential Issue**: For very long text (thousands of characters), string concatenation can be slow.

**Risk**: Low - only becomes a problem with extremely long responses

**Optimization** (if needed):
```typescript
let textChunks: string[] = []; // Use array instead

case 'text-delta':
  textChunks.push(textChunk);
  break;

case 'text-end':
  currentTextContent = textChunks.join(''); // Join once at end
  textChunks = []; // Reset
  break;
```

---

### 4. Tool Result Mapping (Unused?)

**Observation**: Tool results are stored in a Map but never read:

```typescript
// apps/runner/src/lib/ai-sdk-adapter.ts:73, 213-216
let toolResults: Map<string, any> = new Map(); // Declared

case 'tool-result':
  const resultId = part.toolCallId;
  const toolResult = part.result ?? part.output;
  toolResults.set(resultId, toolResult); // Stored but never read
```

**Finding**: This Map is populated but never consumed. Likely dead code.

**Fix**: Remove if unused, or add comment explaining future use:
```typescript
// NOTE: toolResults Map reserved for future use (multi-turn tool chaining)
let toolResults: Map<string, any> = new Map();
```

---

## Page Refresh Issues (Shared with Codex)

Both Claude and Codex suffer from the **same page refresh problems** identified in the main research document:

### 1. Fetch-Based SSE (No EventSource)

**Code**: `apps/sentryvibe/src/app/page.tsx:1309-1310`
```typescript
const reader = res.body?.getReader();
if (!reader) throw new Error("No reader available");
```

**Problem**: 
- ❌ Page refresh kills the reader loop
- ❌ Navigation breaks the stream
- ❌ No automatic reconnection

**Same Issue for Both Agents**: Yes, this is the HTTP layer - agent-agnostic

---

### 2. Dual State Management

**Frontend State**: `apps/sentryvibe/src/app/page.tsx:117-118`
```typescript
const [generationState, setGenerationState] = useState<GenerationState | null>(null);
```

**Backend State**: Database tables (same for both agents)
- `generationSessions`
- `generationTodos`
- `generationToolCalls`
- `generationNotes`

**Problem**: On page refresh, frontend must "hydrate" from database while persistent processor is still writing.

**Same Issue for Both Agents**: Yes - both use the same persistent processor

---

### 3. Hydration Race Condition

**Code**: `apps/sentryvibe/src/app/page.tsx:786-812`
```typescript
useEffect(() => {
  if (selectedProjectSlug) {
    // ...
    if (isGeneratingRef.current) {
      console.log("⚠️ Generation in progress - keeping existing generationState");
      return;
    }
    
    // Load persisted generationState
    if (project.generationState) {
      const restored = deserializeGenerationState(project.generationState as string);
      updateGenerationState(restored);
    }
  }
}, [selectedProjectSlug, /* ... */]);
```

**Problem**: 
- `isGeneratingRef.current` only tracks **frontend** generation
- Doesn't check if **backend** persistent processor is still running
- Can read incomplete state

**Example Timeline**:
```
T=0: User starts Claude build
T=5: Claude executing tools (persistent processor writing to DB)
T=7: User refreshes page
T=7.1: Frontend SSE connection dies
T=7.2: Frontend tries to hydrate from DB
T=7.3: Persistent processor still writing! 🚨
T=7.4: Frontend reads partial/stale state
```

**Same Issue for Both Agents**: Yes - same hydration logic

---

## Claude Configuration Review

### /api/chat Route (Direct Chat)

```typescript
// apps/sentryvibe/src/app/api/chat/route.ts:58-120
const result = streamText({
  model: claudeCode(selectedClaudeModel),
  experimental_telemetry: {
    isEnabled: true,
    functionId: "Code",
  },
  messages: convertToModelMessages(messages),
  async onStepFinish({
    text,
    toolCalls,
    toolResults,
    finishReason,
    usage,
    response,
  }) {
    // Logs to Sentry
  },
});

return result.toUIMessageStreamResponse();
```

**Analysis**:
- ✅ Clean implementation
- ✅ Sentry telemetry enabled
- ✅ Uses `toUIMessageStreamResponse()` - proper SSE format
- ⚠️ **NOT connected to persistent processor** - this is for direct chat only
- ⚠️ Different from builds (which use `/api/projects/[id]/build`)

**Finding**: This route is **stable** because it doesn't use the persistent processor or database at all. It's a simple pass-through stream.

---

### /api/projects/[id]/build Route (Builds)

This is where both Claude and Codex go for actual project builds:

```typescript
// apps/sentryvibe/src/app/api/projects/[id]/build/route.ts:311-320
const persistentCleanup = registerBuild(
  commandId,
  sessionId,
  id,
  buildId,
  agentId,
  agentId === 'claude-code' ? claudeModel : undefined
);
```

**Finding**: Both agents use the **same** persistent processor, so both have the same issues.

---

## Specific Claude Code Settings

### Runner Configuration

```typescript
// apps/runner/src/index.ts:453-477
const model = claudeCode(aiSdkModelId, {
  systemPrompt: combinedSystemPrompt,
  cwd: workingDirectory,
  permissionMode: "bypassPermissions",
  maxTurns: 100,
  additionalDirectories: [workingDirectory],
  allowedTools: [
    "Read", "Write", "Edit", "Bash", "Glob", "Grep",
    "TodoWrite", "NotebookEdit", "Task", "WebSearch", "WebFetch",
  ],
  canUseTool: createProjectScopedPermissionHandler(workingDirectory),
  streamingInput: "always", // REQUIRED when using canUseTool
  settingSources: ["project", "local"],
});
```

**Analysis**:
- ✅ `maxTurns: 100` - reasonable for complex builds
- ✅ `permissionMode: "bypassPermissions"` - necessary for automation
- ✅ `allowedTools` - comprehensive list including TodoWrite
- ✅ `canUseTool` - project scoping enforced
- ⚠️ `streamingInput: "always"` - **critical** for tool callbacks

**No Issues Found**: Configuration is solid

---

### System Prompt (Claude Strategy)

```typescript
// packages/agent-core/src/lib/agents/claude-strategy.ts:5-98
function buildClaudeSections(context: AgentStrategyContext): string[] {
  // Priority 1: Tags or design preferences
  // Priority 2: Project context
  // Priority 3: Workspace rules
}
```

**Analysis**:
- ✅ Clean separation of concerns
- ✅ Tag-based configuration prioritized
- ✅ Fallback to designPreferences for backward compatibility
- ✅ Provides file tree for context

**No Issues Found**: Well-structured

---

## Why Claude is More Stable

### 1. **Better Tool ID Management**

Claude: AI SDK provides IDs from API
```typescript
const toolCallId = part.toolCallId || part.id; // Stable
```

Codex: Must generate IDs manually
```typescript
return `tool-${Date.now()}`; // Collision risk
```

### 2. **Simpler Event Flow**

Claude: 
```
tool-input-start → tool-input-delta → tool-call → tool-result
```
Linear, easy to track

Codex:
```
item.started → [wait] → item.completed → [match by ID]
```
Requires state tracking across events

### 3. **Native AI SDK Integration**

Claude: Uses Vercel AI SDK (well-tested, stable)
Codex: Uses Anthropic Codex SDK (newer, more complex)

---

## Remaining Issues (Both Agents)

Despite Claude being more stable, **both agents share these critical issues**:

| Issue | Fix Required | Urgency |
|-------|-------------|---------|
| Fetch-based SSE (no reconnect) | Switch to EventSource or WebSocket | 🔴 **CRITICAL** |
| Dual state management | Database as single source of truth | 🔴 **CRITICAL** |
| Hydration race condition | Check backend build status before hydrating | 🔴 **CRITICAL** |
| No SSE resume logic | Implement Last-Event-ID resume | 🟠 **HIGH** |

---

## Recommendations

### Immediate Fixes (Claude-Specific)

1. **Replace `Date.now()` with `randomUUID()` in message IDs**
```typescript
// apps/runner/src/lib/ai-sdk-adapter.ts:70
let currentMessageId: string = `msg-${randomUUID()}`;
```

2. **Add buffer timeout cleanup**
```typescript
// Prevent stale tool input buffers
const BUFFER_TIMEOUT = 30000;
setInterval(() => cleanupStaleBuffers(), 10000);
```

3. **Remove unused `toolResults` Map or document its purpose**

### Long-Term Fixes (Both Agents)

**Apply the solutions from RESEARCH_SSE_ISSUES.md**:
- Option A: Database + WebSocket (RECOMMENDED)
- Option B: Persistent SSE with Resume Token
- Option C: Simplified SSE + Polling Fallback

---

## Testing Recommendations

### Claude-Specific Tests

1. **Long-Running Builds**
   - Test with 50+ tool calls
   - Verify no memory leaks from text/buffer accumulation

2. **Rapid Tool Calls**
   - Trigger multiple tools within milliseconds
   - Verify no tool ID collisions (should be clean)

3. **Page Refresh During Build**
   - Start Claude build
   - Refresh at various points (tool execution, text generation)
   - Check if state recovers correctly

### Comparison Test (Claude vs. Codex)

Run identical build with both agents:
```
Prompt: "Build a Next.js app with 10 pages, authentication, and database"
```

Compare:
- Tool call accuracy (duplicates?)
- State recovery after refresh
- Completion consistency

**Expected**: Claude should be more stable, but both will fail on refresh.

---

## Files to Review

**Claude-Specific**:
1. `apps/runner/src/lib/ai-sdk-adapter.ts` - Main streaming logic
2. `packages/agent-core/src/lib/agents/claude-strategy.ts` - Prompt building
3. `apps/sentryvibe/src/app/api/chat/route.ts` - Direct chat (stable reference)

**Shared Issues**:
4. `apps/sentryvibe/src/app/page.tsx` (lines 1309-1700) - SSE consumption
5. `apps/sentryvibe/src/app/api/projects/[id]/build/route.ts` - Build endpoint
6. `packages/agent-core/src/lib/runner/persistent-event-processor.ts` - DB persistence

---

## Conclusion

**Claude Code is more stable because**:
- ✅ Better tool ID management (from AI SDK)
- ✅ Simpler event structure
- ✅ Native AI SDK integration

**But both agents share the fundamental issue**:
- ❌ Page refresh breaks the connection
- ❌ No reconnection mechanism
- ❌ Hydration race conditions

**Solution**: Implement the WebSocket + Database architecture from the main research document. This will fix **both** agents simultaneously.

---

## Next Steps

1. **Apply immediate Claude-specific fixes** (30 minutes)
2. **Verify Claude tool ID stability** with load testing
3. **Implement shared infrastructure fix** (WebSocket + DB)
4. **Test both agents** with the new architecture

Would you like me to start with the Claude-specific fixes, or should we jump straight to the WebSocket implementation? 🚀

