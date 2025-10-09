# Next Steps - UI Polish & Bug Fixes

## ✅ Completed Today
- Remote runner architecture fully functional
- Template downloads working (simple-git)
- Cloudflare tunnels auto-creating
- Port allocation avoiding reserved ports
- Railway deployment configured
- Event-driven metadata (no filesystem access)

## 🐛 Known Issues to Fix

### High Priority

**1. History Tab Disappearing**
- **Issue**: When switching away from a project and back, history tab is gone
- **Root Cause**: `page.tsx` lines 373-388 clear buildHistory/elementChangeHistory when leaving project
- **Fix**: Make history persistent per project (store in state keyed by projectId)

**2. UI Stuck on "Starting"**
- **Issue**: After clicking Start, UI shows "starting" until window refocus
- **Status**: ✅ FIXED with polling (commit ee797f8)
- **Deployed**: Waiting for Railway auto-deploy

**3. Continuous Re-renders**
- **Issue**: SelectionMode re-rendering constantly, thrashing listeners
- **Root Cause**: Likely props/state changing on every render
- **Fix**: Memoize SelectionMode props, use useCallback for handlers

### Medium Priority

**4. PATH Violations**
- **Issue**: Claude uses absolute paths, message-transformer warns about violations
- **Impact**: Warnings only - files are created successfully
- **Options**:
  - A) Relax the transformer's path validation
  - B) Improve system prompt to enforce relative paths better
  - C) Transform absolute → relative in message-transformer

**5. Generation Stops Early**
- **Issue**: Claude sometimes doesn't complete all todos before stopping
- **Impact**: Start button appears too early, some features incomplete
- **Fix**: Either increase maxTurns, or don't send project-metadata until todos complete

**6. Chat Messages Missing**
- **Issue**: When switching projects, chat tab doesn't show all messages
- **Root Cause**: TBD - need to investigate message loading logic

### Low Priority

**7. Vite/Next.js CORS Warnings**
- **Issue**: Next.js warns about cross-origin requests from Cloudflare tunnels
- **Status**: ✅ System prompt updated with config instructions (commit cb67a3e)
- **Impact**: Warnings only - tunnels work fine

**8. npm Warnings in Terminal**
- **Issue**: "Unknown project config 'enable-modules-dir'" from .npmrc
- **Impact**: Cosmetic only
- **Fix**: Update .npmrc template or suppress warnings

## 🎯 Recommended Fix Order

1. **History persistence** (Quick win, better UX)
2. **SelectionMode re-renders** (Performance issue)
3. **PATH violations** (Relax validator - one line change)
4. **Generation stopping early** (Requires tuning)
5. **Chat messages** (Need investigation)

## 📝 Notes

- All core functionality is working
- These are polish/UX issues, not blockers
- System is production-ready for prototype use
- Users can work around most issues (refresh, manual vite config, etc.)
