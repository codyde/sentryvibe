# Event Flow Diagnostic Logging

## Purpose
This branch adds comprehensive diagnostic logging to help debug issues with:
- Tool calls not appearing in the frontend
- Todo tasks "jumping" or skipping states
- Events arriving out of order

## Changes Made

### File: `apps/sentryvibe/src/app/page.tsx`

#### 1. SSE Event Reception Logging
**Location:** Line ~1252

Logs every SSE event as it arrives with timestamp and event type:
```
🌊 [2025-01-22T10:30:45.123Z] SSE Event: tool-input-available (Bash)
```

#### 2. TodoWrite Event Logging
**Location:** Lines ~1389-1406

Comprehensive logging for TodoWrite events showing:
- Timestamp of event
- Current state (BEFORE) - todos and their statuses
- Incoming state (INCOMING) - new todos being applied
- Active todo index and content

Example output:
```
━━━ [2025-01-22T10:30:45.123Z] 📝 TodoWrite Event Received ━━━
   BEFORE: Current state todos: [
     [0] completed: Getting started and exploring workspace
     [1] in_progress: Create project structure
     [2] pending: Add dependencies
   ]
   INCOMING: New todos: 3
   INCOMING: Todo details: [
     [0] completed: Getting started and exploring workspace
     [1] completed: Create project structure
     [2] in_progress: Add dependencies
   ]
   ACTIVE INDEX: 2
   ACTIVE TODO: Add dependencies
```

#### 3. Tool Call Event Logging
**Location:** Lines ~1447-1456

Logs when tool calls are received and which todo they're being associated with:
```
━━━ [2025-01-22T10:30:46.456Z] 🔧 Tool Call Event ━━━
   TOOL: Bash (tool-123abc)
   ACTIVE TODO INDEX: 2
   ACTIVE TODO: Add dependencies
```

Also logs the result of tool nesting:
```
   ✅ Nesting under todo 2 Current tools for this todo: 3
   📊 Updated toolsByTodo: todo0: 5 tools, todo1: 8 tools, todo2: 4 tools
```

#### 4. Tool Output Event Logging
**Location:** Lines ~1528-1562

Logs when tool outputs are received and whether the tool was found:
```
━━━ [2025-01-22T10:30:47.789Z] ✅ Tool Output Event ━━━
   TOOL ID: tool-123abc
   FOUND: Tool in todo[2], name: Bash
```

Or warns if the tool wasn't found:
```
   ⚠️  WARNING: Tool output received but tool not found in any todo!
```

## How to Use

### Enable Debug Logging
Set `DEBUG_PAGE = true` at the top of `page.tsx` (around line 165):
```typescript
const DEBUG_PAGE = true;
```

### Run a Build
1. Start the application in development mode
2. Open browser console (F12)
3. Create a new project or run a continuation build
4. Watch the console for diagnostic output

### What to Look For

#### Normal Flow
Events should appear in this order:
1. `🌊 SSE Event: tool-input-available (TodoWrite)` - Initial todo list
2. `📝 TodoWrite Event Received` - Todos are set, one marked as `in_progress`
3. `🌊 SSE Event: tool-input-available (Bash)` - Tool call
4. `🔧 Tool Call Event` - Tool associated with active todo
5. `🌊 SSE Event: tool-output-available` - Tool completes
6. `✅ Tool Output Event` - Tool output recorded
7. `📝 TodoWrite Event Received` - Todo marked complete, next one `in_progress`
8. Repeat steps 3-7 for each todo

#### Issues to Identify

**Tools not appearing:**
- Check if tool-input-available events are arriving
- Check if tools are being associated with the correct todo index
- Check if activeTodoIndex is being set correctly

**Todos jumping:**
- Compare BEFORE and INCOMING states in TodoWrite events
- Check if active index is progressing sequentially (0 → 1 → 2 → 3)
- Check if todos are changing from pending → in_progress → completed in order

**Events out of order:**
- Compare timestamps across events
- Look for tool outputs arriving before tool inputs
- Look for TodoWrite events arriving after tools (should be before)

## Next Steps

After collecting diagnostic data:
1. Analyze the event order and timing
2. Identify any race conditions or missing events
3. Check if the issue is in:
   - Runner (not sending events)
   - Broker (not forwarding events)
   - Frontend (not processing events correctly)
4. Implement targeted fixes based on findings

## Cleanup

When debugging is complete:
1. Set `DEBUG_PAGE = false` to disable verbose logging
2. Keep the logging code in place for future debugging
3. Consider adding environment variable control: `DEBUG_PAGE = process.env.NEXT_PUBLIC_DEBUG === 'true'`
