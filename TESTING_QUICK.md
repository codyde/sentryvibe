# Quick Testing Guide (Single Command)

## Start Everything at Once

```bash
pnpm dev:all
```

This will start:
- 🌐 **Web App** at http://localhost:3000
- 🔌 **Broker** at http://localhost:4000
- 🏃 **Runner CLI** connected to broker

---

## What to Check in the Terminal Output

You should see logs from all three services interleaved:

### ✅ Broker Started
```
[broker] listening on http://localhost:4000
[broker] Runner WebSocket: ws://localhost:4000/socket
[broker] Client WebSocket: ws://localhost:4000/client-socket
```

### ✅ Runner Connected
```
Runner started with ID: <some-id>
Connected to broker
[broker] Runner connected <runner-id>
```

### ✅ Web App Ready
```
▲ Next.js 15.x.x
- Local: http://localhost:3000
✓ Compiled in X ms
```

---

## Quick Feature Checklist

Open http://localhost:3000 and test:

### 1. **WebSocket Connection** (30 seconds)
- Open DevTools Console (F12)
- Look for: `✅ WebSocket connected - real-time updates enabled`

### 2. **Current Project Indicator** (1 minute)
- Click any project in sidebar
- It should have a **purple/pink gradient background**
- Left border should be purple

### 3. **Runner ID Display** (30 seconds)
- Look at any project card in sidebar
- Should see a small gray text with runner ID (e.g., `default`)

### 4. **Real-Time Updates** (2 minutes)
- Start a server via sidebar
- **Don't refresh the page**
- Watch status change: Gray → Yellow → Green (with port number)
- You should see console logs: `🔄 Project status changed`

### 5. **Command Palette** (2 minutes)
- Press `⌘K` (Mac) or `Ctrl+K` (Windows/Linux)
- Beautiful modal with purple border should appear
- Type project name → filters results
- Try: "New Project", "System Monitor"

### 6. **Bulk Operations** (3 minutes)
- Open command palette (`⌘K`)
- Type "bulk" → Select "Enable Bulk Mode"
- Click 2-3 projects (they get checkmarks)
- Look for: "Stop N Servers" or "Delete N Projects"
- Test one bulk action

---

## If Something Goes Wrong

### Ports Already in Use?

**Check what's running:**
```bash
lsof -i :3000  # Web app
lsof -i :4000  # Broker
```

**Kill if needed:**
```bash
kill -9 <PID>
```

### Need to Restart?

```bash
# Stop all (Ctrl+C)
# Then restart:
pnpm dev:all
```

### Rebuild After Changes?

```bash
pnpm build:all
pnpm dev:all
```

---

## Success! 🎉

If you can:
- ✅ See current project highlighted
- ✅ See runner IDs on cards
- ✅ Get real-time updates (no refresh needed)
- ✅ Open command palette with ⌘K
- ✅ Use bulk operations

Then all features are working correctly!

---

## Advanced: Separate Terminals (Optional)

If `dev:all` has too much log spam, you can run in 3 separate terminals:

**Terminal 1:**
```bash
pnpm --filter sentryvibe-broker dev
```

**Terminal 2:**
```bash
pnpm --filter @sentryvibe/runner-cli dev
```

**Terminal 3:**
```bash
pnpm dev
```

This gives you cleaner logs per service.

---

Need help? See the full [TESTING.md](./TESTING.md) for detailed test cases.
