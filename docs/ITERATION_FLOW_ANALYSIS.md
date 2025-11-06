# Iteration Flow Analysis & Fixes

## Current Issues

### 1. Chat Context Missing During Iteration

**Problem**: When users finish provisioning an app and want to chat/iterate on it, the agent doesn't have:
- Knowledge of the project path on the runner
- Previous conversation context  
- Understanding that it's an existing project (not a new one)

**Root Cause**:
- The `/api/chat/route.ts` endpoint has full `ProjectContext` support BUT is never called
- All messages (both new projects and iterations) go through `startGeneration()` → `/api/projects/${id}/build`
- This triggers the full build pipeline instead of a lightweight chat session
- The build pipeline doesn't pass project-specific context to the agent

**Current Flow**:
```
User submits message
  ↓
handleSubmit() in page.tsx
  ↓
if (!currentProject) → Create new project
if (currentProject) → startGeneration(project.id, prompt)
  ↓
startGenerationStream(projectId, prompt, operationType)
  ↓
POST /api/projects/${id}/build
  ↓
Runner receives 'start-build' command
  ↓
Agent starts with generic system prompt
  ❌ NO PROJECT CONTEXT PROVIDED
```

**What Should Happen for Iteration**:
```
User submits iteration message
  ↓
handleSubmit() detects existing project + chat mode
  ↓
POST /api/chat with:
  - messages: conversation history
  - projectContext: {
      id, name, path, projectType, description
    }
  ↓
Agent receives project-aware system prompt:
  "You are iterating on EXISTING project at {path}..."
  ✅ Has project location
  ✅ Has context about existing code
  ✅ Won't trigger full scaffolding
```

### 2. Duplicate TODO Section Display

**Problem**: When a project finishes building, 2 TODO sections appear briefly.

**Root Cause**:
- When build completes: `generationState.isActive = false` (line 1841)
- Archive effect runs (line 718-749) and adds to `buildHistory`
- BUT `generationState` is NOT cleared
- Result: Build appears in history but `generationState` still exists

**Current Behavior**:
```
Build completes
  ↓
generationState.isActive = false
  ↓
Archive effect adds to buildHistory
  ↓
Render:
  - Active build section (line 2893): Won't render (isActive=false) ✓
  - Build history (line 2935): Renders with completed build ✓
  
So actually this SHOULD work correctly...
```

**Re-examining**: The user reports 2 TODO sections. Let me check if it's:
- The active build AND history both showing (timing issue)
- OR something else causing duplication

### 3. Build vs Chat Interface Separation

**Current**: Separate tabs (Chat / Build)
**User Feedback**: Consider collapsing them together again

The tabs were separated to:
- Chat: Show conversation and progress indicators
- Build: Show detailed TODO lists and tool calls

User suggests keeping them in current chat view but potentially merging the interfaces.

## Proposed Solutions

### Fix 1: Implement True Chat Iteration Mode

**Option A: Use Chat Endpoint for Iterations** (Lightweight)
- When `currentProject` exists and user sends message in Chat tab
- Call `/api/chat` instead of `/api/projects/${id}/build`
- Pass full `projectContext` with project path
- Use Claude Code with project-scoped CWD
- Preserve conversation history

**Option B: Enhance Build Pipeline Context** (Current approach)
- Keep using `/api/projects/${id}/build` for consistency
- But enhance the system prompt sent to runner with project context
- Pass project path, previous context in the build command
- Runner sets CWD to project directory

**Recommendation**: Option A for true iteration, Option B for major changes

### Fix 2: Clear generationState After Archiving

Add cleanup after archiving to history:
```typescript
// After line 747 in page.tsx
setBuildHistoryByProject((prev) => {
  const newMap = new Map(prev);
  newMap.set(currentProject.id, [generationState, ...projectHistory]);
  return newMap;
});

// ADD THIS:
// Clear the active generation state after archiving
updateGenerationState(null);
```

This ensures completed builds only appear in history, not as active state.

### Fix 3: UI Considerations

**Current Layout**:
- Chat Tab: Shows conversation with active todo indicator at top
- Build Tab: Shows detailed TODO list with tool calls

**Potential Improvements**:
1. Keep separation but make it clearer
2. Show mini progress in Chat tab
3. Full details in Build tab
4. OR: Single unified view with collapsible sections

## Implementation Plan

1. **Immediate Fix**: Clear generationState after archiving (Fix 2)
2. **Chat Context Fix**: Implement smart routing (Fix 1 Option A)
   - Detect if message is simple iteration vs major build
   - Route to `/api/chat` for iterations
   - Route to `/api/projects/${id}/build` for major changes
3. **Testing**: Provision app → iterate → verify context preserved
4. **UI Enhancement**: Keep tabs for now, document user feedback

## Technical Details

### How Chat Endpoint Should Be Called

```typescript
// In page.tsx, modify handleSubmit or add new handleChatSubmit
const handleChatIteration = async (message: string) => {
  if (!currentProject) return;

  // Build project context
  const projectContext = {
    id: currentProject.id,
    name: currentProject.name,
    path: currentProject.path,
    projectType: currentProject.projectType || null,
    description: currentProject.description || null,
  };

  // Prepare messages array
  const newMessages = [
    ...messages,
    {
      id: generateId(),
      role: 'user',
      content: message,
    },
  ];

  // Call chat endpoint
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: newMessages,
      projectContext,
      claudeModel: selectedClaudeModelId,
    }),
  });

  // Stream response...
};
```

### Runner Context Setup

When using `/api/chat`, Claude Code needs:
```typescript
claudeCode(modelId, {
  cwd: projectContext.path, // ← Project directory
  systemPrompt: {
    type: "preset",
    preset: "claude_code",
    append: projectAwarePrompt, // ← Custom context
  },
  permissionMode: "bypassPermissions",
  additionalDirectories: [projectContext.path],
});
```

This ensures the agent operates within the project directory and has proper context.

## Next Steps

1. ✅ Document current flow and issues
2. 🔄 Implement immediate fix for duplicate TODOs
3. 🔄 Implement chat context passing
4. ⏳ Test full provision → iterate cycle
5. ⏳ Gather user feedback on UI

## Questions to Resolve

1. Should "Chat" always use `/api/chat` and "Build" use `/api/projects/${id}/build`?
2. Or should we intelligently route based on message complexity?
3. How do we preserve conversation history across both flows?
4. Should we merge the interfaces or keep them separate?

