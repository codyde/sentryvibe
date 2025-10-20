# Fix: ReferenceError - handleRenameProject is not defined

## Root Cause
This error is caused by **stale build artifacts** in your local `.next` directory. The compiled code contains references to `CommandPaletteProvider` and its props (`handleRenameProject`, `handleDeleteProject`) that were removed in a previous code refactor.

## Solution: Clear Build Cache

Run these commands from the **root of the repository**:

```bash
# 1. Stop the development server (Ctrl+C if running)

# 2. Clear the Next.js build cache
rm -rf apps/sentryvibe/.next

# 3. Clear any other build artifacts (optional but recommended)
rm -rf apps/sentryvibe/out
rm -rf apps/sentryvibe/.turbo

# 4. Restart the development server
cd apps/sentryvibe
pnpm dev
# OR if using npm:
npm run dev
```

## Alternative: Full Clean Rebuild

If the above doesn't work, do a complete clean rebuild:

```bash
# Stop the dev server first

# Clear all build artifacts
rm -rf apps/sentryvibe/.next
rm -rf apps/sentryvibe/out
rm -rf apps/sentryvibe/.turbo
rm -rf node_modules/.cache

# If using pnpm (recommended):
pnpm install
cd apps/sentryvibe
pnpm build
pnpm dev

# If using npm:
npm install
cd apps/sentryvibe
npm run build
npm run dev
```

## Verification

After restarting, you should see:
1. ✅ No `ReferenceError: handleRenameProject is not defined` in browser console
2. ✅ Application loads successfully on http://localhost:3000
3. ✅ No Sentry errors related to this issue

## Technical Details

The source code is clean - confirmed:
- ✅ No references to `CommandPaletteProvider` in codebase
- ✅ No references to `handleRenameProject` in codebase  
- ✅ No references to `handleDeleteProject` in codebase

The error only exists in **compiled build artifacts** that were generated from an older version of the code.

---

**Once fixed, you can safely delete this file.**