# Port Management Fix

## Problem Identified

When users generated a new project and told Claude to "start" it:
- Claude would start the dev server via Bash command
- This bypassed the proper port allocation system
- The terminal showed the server running on port 5174
- But the preview panel tried to open port 5173 (from the old project)
- Result: Wrong port, broken preview

## Root Cause

**Two different server starting mechanisms:**

1. **UI Start Button** (Correct ✅)
   - Calls `/api/projects/{id}/start`
   - Uses `findAvailablePort()` (3001-3100 range)
   - Updates database with `devServerPort`
   - PreviewPanel reads from database
   - Everything stays in sync

2. **Claude Bash Commands** (Problem ❌)
   - Claude runs `npm run dev` directly
   - Uses whatever port the framework picks
   - Database NOT updated
   - PreviewPanel shows wrong/old port
   - Complete disconnect

## Solution Implemented

### 1. Updated Generation Prompt

**File:** `src/app/api/projects/[id]/generate/route.ts`

**Changes:**
- Added explicit port instructions (PORT=5174 for testing)
- Added step 4: "CRITICAL: After testing is complete"
  - Tell user to use the UI Start button
  - Never start servers via Bash for production use
  - Only test servers temporarily, then kill

**Key Instructions:**
```
4. CRITICAL: After testing is complete:
   - DO NOT tell the user to manually start the server
   - DO NOT start the server yourself via Bash
   - Tell the user: "Your project is ready! Click the Start button in the preview panel to run it."
   - The UI will handle proper port allocation and preview
```

### 2. Updated Chat Prompt

**File:** `src/app/api/claude-agent/route.ts`

**Changes:**
- Added step 4: "How to handle server starting requests"
- Clear instructions for when user says "start the server"
- Direct users to the UI button
- Explain that UI handles port allocation

**Key Instructions:**
```
4. CRITICAL: How to handle server starting requests:
   - If user asks to "start the server" or "run the app":
     * Tell them: "Click the Start button in the preview panel to run your project."
     * The UI handles proper port allocation automatically
   - NEVER start production dev servers via Bash in chat
   - Only start servers temporarily for testing, then kill immediately
```

## How It Works Now

### Correct Flow:

1. **Project Generation:**
   ```
   User submits prompt
   → Claude scaffolds project
   → Claude tests build (PORT=5174)
   → Claude KILLS test server
   → Claude tells user: "Click Start button"
   ```

2. **User Starts Server:**
   ```
   User clicks Start button
   → UI calls /api/projects/{id}/start
   → findAvailablePort() allocates port (3001-3100)
   → Updates DB with devServerPort
   → PreviewPanel refetches project data
   → iframe loads correct port
   ```

3. **If User Asks Claude to Start:**
   ```
   User: "start the server"
   → Claude: "Click the Start button in the preview panel"
   → User clicks button
   → Proper flow executes
   ```

## Port Allocation System

**Port Ranges:**
- `5173`: Main SentryVibe app
- `3001-3100`: User projects (managed by `port-allocator.ts`)
- `5174`: Temporary testing port (Claude uses this, then kills)

**Port Allocator** (`src/lib/port-allocator.ts`):
- Checks database for ports in use
- Scans 3001-3100 for available port
- Tests port availability with net.createServer()
- Returns first available port
- Generates framework-specific commands:
  - Next.js: `PORT={port} npm run dev`
  - Vite: `npm run dev -- --port {port}`
  - Astro: `npm run dev -- --port {port}`

**Process Manager** (`src/lib/process-manager.ts`):
- Stores running processes in global Map
- Survives Next.js HMR (Hot Module Reload)
- Detects ports from stdout with regex
- Emits port detection events
- Updates database when port confirmed

## Benefits

✅ **No More Port Conflicts:**
- Each project gets unique port in managed range
- No accidental port collisions

✅ **Consistent Preview:**
- Preview always shows correct port
- No more "wrong project" previews

✅ **Database Sync:**
- Database always reflects actual running port
- UI always in sync with reality

✅ **User Clarity:**
- Clear instructions to use UI button
- No confusion about how to start projects

## Additional Improvements Possible

### 1. Visual Feedback in PreviewPanel

Add a prominent message when project is ready but not started:

```typescript
{project?.status === 'completed' && !project?.devServerPort && (
  <div className="text-center p-8">
    <h3>Project Ready! 🎉</h3>
    <p>Click the Start button above to launch your dev server</p>
  </div>
)}
```

### 2. Auto-Start on Generation Complete

The code already has this (page.tsx:106-109):
```typescript
if (project.status === 'completed' && project.runCommand) {
  console.log('🚀 Generation completed, auto-starting dev server...');
  setTimeout(() => startDevServer(), 1000);
}
```

Consider making this more visible with a toast notification.

### 3. Port Conflict Detection

Add warning if user tries to start a project but all ports 3001-3100 are occupied:
```typescript
if (noAvailablePorts) {
  alert('All ports in use! Stop other projects first.');
}
```

### 4. Kill Old Servers Automatically

When starting a new project, optionally prompt:
```
"Project A is still running on port 3005. Stop it first? [Yes] [No]"
```

## Testing

To verify the fix:

1. **Generate a new project:**
   - Should test build on PORT=5174
   - Should kill test server
   - Should tell you to click Start button

2. **Click Start button:**
   - Should allocate port from 3001-3100
   - Preview should show correct port
   - Database should be updated

3. **Try telling Claude to "start the server":**
   - Should direct you to use UI button
   - Should NOT start server via Bash

## Future Considerations

### Port Range Expansion
If you need more than 100 simultaneous projects:
```typescript
const PORT_RANGE_START = 3001;
const PORT_RANGE_END = 3500; // Expand range
```

### Custom Port Selection
Allow users to specify preferred ports:
```typescript
<input type="number" placeholder="Preferred port (optional)" />
```

### Port Persistence
Store preferred ports in user preferences:
```typescript
userPreferences: {
  projectId: string;
  preferredPort: number;
}
```

---

**Status:** ✅ Fixed
**Files Modified:**
- `src/app/api/projects/[id]/generate/route.ts`
- `src/app/api/claude-agent/route.ts`

**No Breaking Changes**
