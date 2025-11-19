# Hybrid Port Strategy - Best of Both Worlds 🎯

## Overview

The port allocation system now supports **TWO strategies** that auto-select based on runner type:

1. **`isolated`** - Higher port ranges (3101+) to avoid conflicts with local dev servers
2. **`standard`** - Framework-standard ports (3000, 5173, etc.) for best compatibility

---

## 🎪 How It Works

### Auto-Detection

```typescript
// Local runner (same machine as web UI)
isRemoteRunner = false
  ↓
strategy = 'isolated'
  ↓
Next.js uses ports 3101-3200 ✅ No conflict with user's port 3000!

// Remote runner (different machine)
isRemoteRunner = true
  ↓
strategy = 'standard'
  ↓
Next.js uses ports 3000-3100 ✅ Framework standard, no conflicts possible!
```

### Port Ranges

| Framework  | Isolated Range | Standard Range | Why Split? |
|-----------|---------------|----------------|------------|
| **Next.js** | 3101-3200 | 3000-3100 | User's Next.js → 3000<br>SentryVibe → 3101 ✅ |
| **TanStack** | 3101-3200 | 3000-3100 | Same as Next.js (uses Vite) |
| **Node.js** | 3101-3200 | 3000-3100 | Generic Node apps |
| **Vite** | 5201-5300 | 5173-5273 | User's Vite → 5173<br>SentryVibe → 5201 ✅ |
| **Astro** | 4401-4500 | 4321-4421 | User's Astro → 4321<br>SentryVibe → 4401 ✅ |
| **Default** | 8100-8200 | 8000-8100 | Unknown frameworks |

---

## 📋 Scenarios

### Scenario 1: Local Development (Most Common)

**User's machine:**
- Has Next.js project on port 3000
- Has Vite project on port 5173  
- SentryVibe CLI running locally

**What happens:**
```
1. User starts SentryVibe Next.js build
   
2. System detects: runnerId = 'local' → isRemoteRunner = false
   
3. Strategy = 'isolated'
   
4. Port allocator scans 3101-3200
   ✅ Allocates port 3101 (no conflict with user's 3000!)

5. Dev server starts: npm run dev -- -p 3101
```

**Result:** User can work on BOTH their project (port 3000) AND SentryVibe build (port 3101) simultaneously! 🎉

---

### Scenario 2: Remote Runner

**Setup:**
- Web UI on machine A
- Runner CLI on machine B (different physical/virtual machine)
- No local dev servers on machine B

**What happens:**
```
1. User starts SentryVibe Next.js build
   
2. System detects: runnerId = 'remote-abc' → isRemoteRunner = true
   
3. Strategy = 'standard'
   
4. Port allocator scans 3000-3100
   ✅ Allocates port 3000 (framework standard!)

5. Dev server starts: npm run dev -- -p 3000
```

**Result:** Uses framework defaults for best compatibility. No conflicts possible since runner is on different machine! 🎉

---

## ⚙️ Manual Override

You can force a specific strategy via environment variable:

```bash
# Force isolated strategy everywhere (even for remote runners)
PORT_STRATEGY=isolated

# Force standard strategy everywhere (even for local runners)  
PORT_STRATEGY=standard
```

**When to use:**
- Testing different strategies
- Special deployment configurations
- Debugging port issues

---

## 🧪 Testing Both Strategies

```bash
# Test isolated strategy
PORT_STRATEGY=isolated npm run dev

# Test standard strategy
PORT_STRATEGY=standard npm run dev

# Test auto-detection (default)
npm run dev
```

---

## 💡 Why This Is Better

### Previous Approach (Pick One)
```
❌ Standard ports (3000): Conflicts with local dev
❌ Isolated ports (3101): Framework compatibility issues
```

### Hybrid Approach (Best of Both)
```
✅ Local runners → Isolated ports → No conflicts!
✅ Remote runners → Standard ports → Best compatibility!
✅ User control → ENV override → Manual testing!
```

---

## 🔍 Debug Logging

Enable verbose logging to see strategy selection:

```bash
VERBOSE_PORT_ALLOCATOR=true npm run dev
```

**Output:**
```
🎯 Port allocation request for project abc-123
   Framework: next
   🔧 Port strategy: isolated (auto-detected: runner is local)
   Range: 3101-3200 (default: 3101)
   
🔍 Scanning for available port
   Range: 3101-3200, starting from: 3101
   ✅ Found available port: 3101
```

---

## 📊 Comparison Matrix

| Aspect | Isolated | Standard | Hybrid (Auto) |
|--------|----------|----------|---------------|
| **Local conflicts** | ✅ None | ❌ Possible | ✅ Auto-handles |
| **Framework compat** | ⚠️ May need config | ✅ Perfect | ✅ Optimized |
| **Remote runners** | ⚠️ Unnecessary | ✅ Optimal | ✅ Smart |
| **HMR/Hot reload** | ⚠️ Sometimes finicky | ✅ Works great | ✅ Context-aware |
| **Tunnel services** | ⚠️ Needs setup | ✅ Plug & play | ✅ Intelligent |
| **User control** | Manual only | Manual only | ✅ Auto + Override |

---

## 🎯 Key Benefits

### For Local Development
- ✅ **No port conflicts** with user's existing dev servers
- ✅ **Work on multiple projects** simultaneously
- ✅ **Predictable** - always uses isolated range

### For Remote Runners
- ✅ **Framework-standard ports** for best compatibility
- ✅ **Tunnel-friendly** (ngrok, localtunnel default to 3000)
- ✅ **HMR works perfectly** out of the box

### For DevOps
- ✅ **One codebase** handles all scenarios
- ✅ **Auto-detection** reduces configuration
- ✅ **Override available** for special cases

---

## 🚀 Cross-Platform Support

Works identically on:
- ✅ **macOS** (Darwin)
- ✅ **Linux** (Ubuntu, Debian, etc.)
- ✅ **Windows** (via WSL or native)

Uses Node's `net.createServer()` which abstracts platform differences.

---

## 📝 Implementation Details

### Code Example

```typescript
// Determine strategy automatically
const isRemoteRunner = runnerId !== 'local';
const strategy = getPortStrategy(isRemoteRunner);

// Get appropriate range
const range = getPortRange('next', strategy);
// Local: { start: 3101, end: 3200, default: 3101 }
// Remote: { start: 3000, end: 3100, default: 3000 }

// Scan for available port
const port = await findAvailablePortInRange(range);

// Reserve in database
await reservePortInDatabase(projectId, port);
```

### Key Functions

1. **`getPortStrategy(isRemoteRunner)`** - Auto-detect or use ENV override
2. **`getPortRange(framework, strategy)`** - Get correct range for context
3. **`findAvailablePortInRange(range)`** - Scan OS for available port
4. **`reservePortInDatabase()`** - Atomic reservation in DB

---

## 🐛 Troubleshooting

### "All ports in range 3101-3200 are in use"

**Local runner, isolated strategy:**
- You have 100 SentryVibe projects running?! 😅
- **Fix:** Stop old dev servers or run: `PORT_STRATEGY=standard`

### "Port 3000 already in use"

**Remote runner, standard strategy:**
- Another service is using port 3000 on remote machine
- **Fix:** System will auto-scan to 3001, 3002, etc.
- Or use: `PORT_STRATEGY=isolated`

### "Strategy is wrong for my setup"

**Manual override:**
```bash
# Force the strategy you want
PORT_STRATEGY=isolated  # or 'standard'
```

---

## 📈 Migration from Previous Version

### Before (Single Range)
```typescript
next: { start: 3101, end: 3200, default: 3101 }
// or
next: { start: 3000, end: 3100, default: 3000 }
```

### After (Dual Range - Hybrid)
```typescript
next: {
  isolated: { start: 3101, end: 3200, default: 3101 },
  standard: { start: 3000, end: 3100, default: 3000 },
}
```

**No breaking changes!** The API remains the same:
```typescript
const portInfo = await reserveOrReallocatePort(params, isRemoteRunner);
```

---

## 🎓 Best Practices

1. **Let auto-detection work** - it handles 99% of cases
2. **Use ENV override for testing** - verify both strategies work
3. **Check logs with VERBOSE_PORT_ALLOCATOR** - understand what's happening
4. **Document custom PORT_STRATEGY** - if you override defaults

---

## ✅ Summary

**The hybrid approach gives you:**
- 🎯 Original design benefits (isolated ports, no conflicts)
- 🚀 New design benefits (standard ports, compatibility)
- 🤖 Automatic selection based on context
- 🔧 Manual override when needed
- 🌍 Cross-platform support
- 📊 Comprehensive logging

**It's the best of both worlds!** 🎉

