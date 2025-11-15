# Image Paste - Runner Integration TODO

**Status:** Frontend and Backend API complete, Runner integration needed

## Problem

Images are being captured in the UI and sent to the build API, but they're not reaching Claude because the runner doesn't forward them in the correct format.

## What's Complete ✅

1. **Frontend (`apps/sentryvibe/src/app/page.tsx`):**
   - ✅ Paste handler captures images
   - ✅ Image state management
   - ✅ `messageParts` passed to `startGenerationStream`
   - ✅ Image parts included in build API request

2. **Build API (`apps/sentryvibe/src/app/api/projects/[id]/build/route.ts`):**
   - ✅ Receives `messageParts` from frontend
   - ✅ Forwards `messageParts` to runner in payload

3. **Type Definitions (`packages/agent-core/src/types/build.ts`):**
   - ✅ `MessagePart` interface added
   - ✅ `BuildRequest.messageParts?` added

## What's Needed ❌

### 1. Update Build Context Types

**File:** `apps/runner/src/lib/build-orchestrator.ts`

```typescript
export interface BuildContext {
  // ... existing fields ...
  messageParts?: MessagePart[]; // ADD THIS
}
```

### 2. Pass messageParts Through Orchestration

**File:** `apps/runner/src/index.ts` (around line 1660)

When creating the orchestration context, add:

```typescript
const buildContext: BuildContext = {
  projectId: command.projectId,
  projectName,
  prompt: command.payload.prompt,
  messageParts: command.payload.messageParts, // ADD THIS
  operationType: command.payload.operationType,
  // ... rest of fields
};
```

### 3. Update BuildStreamOptions

**File:** `apps/runner/src/lib/build/engine.ts`

```typescript
interface BuildStreamOptions {
  // ... existing fields ...
  messageParts?: MessagePart[]; // ADD THIS
}
```

### 4. Pass messageParts to createBuildStream

**File:** `apps/runner/src/index.ts` (around line 1783)

```typescript
const stream = await createBuildStream({
  projectId: command.projectId,
  projectName,
  prompt: orchestration.fullPrompt,
  messageParts: command.payload.messageParts, // ADD THIS
  operationType: command.payload.operationType,
  // ... rest of fields
});
```

### 5. Update BuildQueryFn Type

**File:** `apps/runner/src/lib/build/engine.ts`

```typescript
type BuildQueryFn = (
  prompt: string,
  workingDirectory: string,
  systemPrompt: string,
  agent?: AgentId,
  codexThreadId?: string,
  messageParts?: MessagePart[] // ADD THIS
) => AsyncGenerator<unknown, void, unknown>;
```

**Also in:** `apps/runner/src/index.ts` (line 94)

### 6. Update createClaudeQuery to Handle Images

**File:** `apps/runner/src/index.ts` (around line 417)

This is the **critical change**. The query function needs to build multi-part messages for Claude:

```typescript
function createClaudeQuery(
  modelId: ClaudeModelId = DEFAULT_CLAUDE_MODEL_ID
): BuildQueryFn {
  return async function* (prompt, workingDirectory, systemPrompt, agent, codexThreadId, messageParts) {
    // ... existing setup code ...

    // Build user message content
    let userMessage: string | Array<{ type: string; [key: string]: unknown }>;

    if (messageParts && messageParts.length > 0) {
      // Multi-part message with images
      const contentParts: Array<{ type: string; [key: string]: unknown }> = [];

      // Add image parts first (Claude best practice)
      for (const part of messageParts) {
        if (part.type === 'image' && part.image) {
          // Extract base64 data from data URL
          const match = part.image.match(/^data:(.+);base64,(.+)$/);
          if (match) {
            contentParts.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: match[1],
                data: match[2],
              }
            });
          }
        } else if (part.type === 'text' && part.text) {
          contentParts.push({
            type: 'text',
            text: part.text
          });
        }
      }

      // Add prompt text if not already in parts
      if (!contentParts.some(p => p.type === 'text')) {
        contentParts.push({
          type: 'text',
          text: prompt
        });
      }

      userMessage = contentParts;
    } else {
      // Simple text message (existing behavior)
      userMessage = prompt;
    }

    // Call query function with the correct message format
    const generator = query(
      {
        cwd: workingDirectory,
        systemPrompt: finalSystemPrompt,
        model: claudeModel,
      },
      userMessage // This can now be string OR array of content parts
    );

    // ... rest of existing code ...
  };
}
```

### 7. Import MessagePart Type in Runner

**Files that need the import:**
- `apps/runner/src/index.ts`
- `apps/runner/src/lib/build/engine.ts`
- `apps/runner/src/lib/build-orchestrator.ts`

```typescript
import type { MessagePart } from '@sentryvibe/agent-core/types/build';
```

## Testing Checklist

After implementing these changes:

1. ✅ Paste image in UI
2. ✅ Verify image appears as chip
3. ✅ Add text prompt
4. ✅ Submit
5. ❌ **Check runner logs** - should show image being sent to Claude
6. ❌ **Check Claude response** - should acknowledge the image
7. ❌ **Verify Claude can describe/analyze the image**

## Current Logs Show

```
"I don't see an attachment in your message"
```

This confirms Claude is not receiving the image data.

## Expected Logs After Fix

```
[runner] [createClaudeQuery] Building multi-part message with 1 image(s)
[runner] [ai-sdk-adapter] Sending message with content array
[runner] Claude: I can see the image you shared. It shows...
```

## Implementation Priority

**CRITICAL PATH:**
1. Step 6 (createClaudeQuery changes) - This is where images must be formatted for Claude
2. Step 5 (BuildQueryFn signature) - Required for step 6
3. Steps 1-4 (passing messageParts through the chain) - Required for steps 5-6

## Notes

- The Vercel AI SDK's `query` function should handle both string and array content formats
- Claude's vision API expects `content` to be an array when images are present
- Images must be in the format: `{ type: 'image', source: { type: 'base64', media_type: '...', data: '...' } }`
- Text must be in the format: `{ type: 'text', text: '...' }`

## References

- **Claude Vision API:** https://docs.claude.com/en/docs/build-with-claude/vision
- **Research Doc:** `docs/IMAGE_PASTE_IMPLEMENTATION_RESEARCH.md`
- **Frontend Implementation:** Complete (see git history)
