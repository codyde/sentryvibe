# Testing Guide: Sidebar Improvements

## Overview
This guide will walk you through testing all the new features on the `feature/sidebar-improvements` branch.

---

## Prerequisites

✅ You're on the `feature/sidebar-improvements` branch
✅ Dependencies are installed (`pnpm install`)
✅ Broker and CLI are built (done above)

---

## Test Plan

### **Test 1: Start the Infrastructure** ⚙️

You need **3 terminal windows** running simultaneously:

#### Terminal 1: Broker
```bash
cd apps/broker
pnpm start
```

**Expected Output:**
```
[broker] listening on http://localhost:4000
[broker] Runner WebSocket: ws://localhost:4000/socket
[broker] Client WebSocket: ws://localhost:4000/client-socket
```

#### Terminal 2: Runner CLI
```bash
cd apps/runner
node ./dist/index.js
```

**Expected Output:**
```
Runner started with ID: <some-id>
Connected to broker at ws://localhost:4000/socket
```

#### Terminal 3: Web App
```bash
pnpm dev
```

**Expected Output:**
```
▲ Next.js 15.x.x
- Local: http://localhost:3000
```

---

### **Test 2: WebSocket Connection** 🔌

1. **Open the web app** at http://localhost:3000
2. **Open browser DevTools** (F12 or Cmd+Option+I)
3. **Check Console**

**Expected:**
```
[WebSocket] Connecting to ws://localhost:4000/client-socket
[WebSocket] Connected to project updates
✅ WebSocket connected - real-time updates enabled
```

**If you see errors:**
- Make sure broker is running (Terminal 1)
- Check that port 4000 is not blocked
- Verify broker logs show: `[broker] Client connected client-xxxxx`

---

### **Test 3: Current Project Indicator** 🎯

1. **In the sidebar, create or select a project**
2. **Click on any project** to open it
3. **Look at the sidebar**

**Expected:**
- The selected project has a **purple/pink gradient background**
- **Purple left border** (2px)
- Icon color changes to **purple** (instead of gray)
- Project name is **bold**

**Test with multiple projects:**
- Click different projects
- Indicator should move to the newly selected project
- Only ONE project should be highlighted at a time

---

### **Test 4: Runner ID Display** 🏃

**On project cards in the sidebar:**

**Compact View (default):**
- Look for a small **monospace gray text** showing first 8 characters of runner ID
- Example: `default` or `my-runn`
- It appears when **NOT hovering**

**Full Card View (if expanded):**
- Runner ID shows as a **blue badge**
- Format: First 12 characters
- Located in the status info row

**How to verify:**
- Check multiple projects
- They should all show the same runner ID (if using one runner)
- If runner is offline, the badge should still show but might be grayed out

---

### **Test 5: Real-Time Updates via WebSocket** ⚡

This is the **most important test** - ensures you don't need to refresh anymore!

#### Test 5A: Start a Server

1. **In the sidebar, find a project** with a "Start" button/action
2. **Click Start** (or use Quick Actions on hover)
3. **Watch the sidebar WITHOUT refreshing the page**

**Expected:**
- Project status changes from gray/idle to **yellow (starting)**
- After a few seconds, changes to **green (running)**
- Port number appears: `:3000` or similar
- You should see console logs:
  ```
  🔄 Project status changed: { projectId, devServerStatus: 'running', ... }
  ```

#### Test 5B: Stop a Server

1. **Click Stop** on a running project
2. **Watch the sidebar**

**Expected:**
- Green dot changes to gray/idle
- Port number disappears
- Status updates **instantly** (no page refresh!)

#### Test 5C: Build a New Project

1. **Create a new project** (click "New Project" button)
2. **Type a prompt** and submit
3. **Watch the Activity Feed in sidebar**

**Expected:**
- As the build progresses, you see real-time updates:
  - "Building project..." (yellow indicator)
  - Build progress updates in Activity Feed
  - When complete: "Completed" (blue indicator)

**Console logs should show:**
```
📦 New project created: <project-name>
🔄 Project status changed: { status: 'in_progress' }
🔄 Project status changed: { status: 'completed' }
```

---

### **Test 6: Command Palette (⌘K)** 🎹

#### Test 6A: Open/Close

**Keyboard shortcuts:**
- **Mac:** `⌘K` (Command + K)
- **Windows/Linux:** `Ctrl+K`

**Expected:**
- Beautiful modal appears with **purple/pink gradient border**
- Backdrop blur effect
- Search input is focused automatically
- Press `Esc` to close

#### Test 6B: Search Projects

1. **Open command palette** (⌘K)
2. **Type a project name**

**Expected:**
- Projects filter as you type (fuzzy search)
- Each project shows:
  - Project icon
  - Project name
  - Description: "View <project-name>"
- Use **Arrow Keys (↑/↓)** to navigate
- Press **Enter** to open project

#### Test 6C: Global Actions

**Search for these actions:**

1. **"New Project"**
   - Should appear under "Actions" group
   - Click or press Enter → navigates to home

2. **"System Monitor"**
   - Should appear under "Actions" group
   - Click → opens Process Manager modal

3. **"Start <project>"** (for stopped projects)
   - Should appear under "Server Actions"
   - Click → starts the dev server

4. **"Stop <project>"** (for running projects)
   - Should appear under "Server Actions"
   - Click → stops the dev server

5. **"Open <project>"** (for running projects)
   - Should appear under "Server Actions"
   - Click → opens localhost in new tab

---

### **Test 7: Bulk Operations** 📦

#### Test 7A: Enable Bulk Mode

1. **Open command palette** (⌘K)
2. **Type "bulk"** or scroll to find **"Enable Bulk Mode"**
3. **Select it**

**Expected:**
- Badge appears in palette: **"Bulk Mode"**
- All projects now show with **clickable checkboxes** (conceptually)
- Clicking a project **selects it** instead of opening it
- Selected projects show **"✓ Project Name"**

#### Test 7B: Select Multiple Projects

1. **Click on 3-4 projects** in the palette
2. **Watch the badge update**: **"3 selected"**

**Expected:**
- Each selected project shows "✓" prefix
- Counter badge updates in real-time
- Projects stay in the list (palette doesn't close)

#### Test 7C: Bulk Stop Servers

1. **Select 2+ projects** that are currently **running**
2. **Look for**: **"Stop N Servers"** action (should appear under "Bulk Actions" group)
3. **Click it**

**Expected:**
- All selected running servers stop
- Sidebar updates immediately (green → gray)
- Command palette closes automatically
- Selection is cleared

#### Test 7D: Bulk Delete Projects

1. **Select 2+ projects** you don't mind deleting
2. **Look for**: **"Delete N Projects"**
3. **Click it**

**Expected:**
- Confirmation dialog appears:
  - "Are you sure you want to delete N project(s)? This cannot be undone."
- Click **OK** → projects are deleted
- Sidebar updates (projects disappear)
- Command palette closes

#### Test 7E: Clear Selection

1. **Select several projects**
2. **Look for**: **"Clear Selection"** action
3. **Click it**

**Expected:**
- All checkmarks disappear
- Badge changes from "N selected" to nothing
- Bulk mode is disabled
- Projects are clickable again (navigate on click)

---

### **Test 8: Stress Testing** 💪

#### Test 8A: Multiple Rapid Actions

1. **Open command palette**
2. **Start 3 servers quickly** (one after another via palette)
3. **Watch sidebar**

**Expected:**
- All 3 projects update in real-time
- No race conditions or stale data
- WebSocket handles rapid updates gracefully

#### Test 8B: Disconnect/Reconnect Broker

1. **Stop the broker** (Terminal 1: Ctrl+C)
2. **Watch console**

**Expected:**
```
❌ WebSocket disconnected - falling back to polling
[WebSocket] Reconnecting in 3000ms (attempt 1/5)
```

3. **Restart the broker** (`pnpm start`)

**Expected:**
```
[WebSocket] Reconnecting in...
✅ WebSocket connected - real-time updates enabled
```

---

### **Test 9: Edge Cases** 🧪

#### Test 9A: No Projects

1. **Delete all projects** (or start fresh)
2. **Open command palette** (⌘K)

**Expected:**
- Only shows: "New Project", "System Monitor", "Enable Bulk Mode"
- No project-related actions

#### Test 9B: Many Projects (10+)

1. **Create 10+ projects** (or use existing ones)
2. **Open command palette**
3. **Search/scroll**

**Expected:**
- Palette scrolls smoothly
- Search filters correctly
- Performance is good (no lag)

#### Test 9C: Project with Long Name

1. **Create a project with a very long name**
2. **Check sidebar and command palette**

**Expected:**
- Name truncates with ellipsis (`...`)
- Doesn't break layout
- Tooltip shows full name on hover (in sidebar)

---

## Success Criteria ✅

If all these tests pass, you're good to go:

- ✅ WebSocket connects automatically on page load
- ✅ Current project is highlighted in sidebar
- ✅ Runner IDs are visible on project cards
- ✅ Real-time updates work (no need to refresh)
- ✅ Command palette opens with ⌘K/Ctrl+K
- ✅ Search filters projects correctly
- ✅ Bulk mode enables multi-select
- ✅ Bulk operations (stop/delete) work correctly
- ✅ Reconnection works if broker restarts
- ✅ No console errors (except deprecation warnings)

---

## Troubleshooting 🔧

### WebSocket won't connect

**Check:**
```bash
# Terminal 1: Is broker running?
curl http://localhost:4000/status -H "Authorization: Bearer <your-secret>"

# Expected: { "connections": [...], "clients": N }
```

**Solution:**
- Restart broker
- Check `.env` file has `RUNNER_SHARED_SECRET`
- Verify port 4000 is not in use: `lsof -i :4000`

### Command palette doesn't open

**Check Console for errors:**
- "Cannot find module 'cmdk'" → Run `pnpm install`
- "Cannot find module 'zustand'" → Run `pnpm install`

**Solution:**
```bash
pnpm install
pnpm dev
```

### Bulk operations don't work

**Check:**
- Are you actually in bulk mode? (Badge should say "Bulk Mode")
- Are projects selected? (Badge should say "N selected")
- For "Stop N Servers", are any selected projects actually running?

### Current project not highlighting

**Check:**
- URL has `?project=<slug>` query parameter
- Project slug matches exactly
- Sidebar is showing the correct section (Active/Recent/All)

---

## Clean Up After Testing

If you want to reset everything:

```bash
# Stop all terminals (Ctrl+C in each)

# Clean database (if using SQLite)
rm -rf apps/sentryvibe/.next

# Restart fresh
pnpm dev
```

---

## Report Issues

If something doesn't work as expected:

1. **Note the test number** (e.g., "Test 5B failed")
2. **Copy the console output** (errors, warnings)
3. **Screenshot** (if visual issue)
4. **Let me know!**

---

Happy testing! 🚀
