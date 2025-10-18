# Troubleshooting Guide

This document contains solutions to common issues you may encounter while developing or running SentryVibe.

## Table of Contents

- [Build & Development Issues](#build--development-issues)
- [React Fast Refresh Errors](#react-fast-refresh-errors)

---

## Build & Development Issues

### React Fast Refresh Errors

#### Symptom: `ReferenceError: [variable] is not defined` during Fast Refresh

**Example Error:**
```
ReferenceError: viewMode is not defined
  at BuildProgress (src/components/BuildProgress/index.tsx:195:19)
```

**Root Cause:**

This error occurs when Next.js/webpack build cache contains references to files or components that have been refactored, renamed, or deleted. During React Fast Refresh (Hot Module Replacement), the dev server tries to reload these stale cached modules, causing runtime errors.

Common scenarios:
- Component was renamed or moved (e.g., `BuildProgress` → `GenerationProgress`)
- Component was deleted but cache still references it
- Variable references exist in cached code but not in source
- Dependency arrays in `useEffect` hooks have changed size between renders (prevents Fast Refresh recovery)

**Solution:**

Clear the Next.js build cache and node_modules cache:

```bash
# Clear Next.js build cache
rm -rf apps/sentryvibe/.next

# Clear Node.js module cache (optional but recommended)
rm -rf apps/sentryvibe/node_modules/.cache

# If issues persist, also clear workspace node_modules cache
rm -rf node_modules/.cache

# Restart the dev server
pnpm dev
```

**For macOS/Linux users:**
```bash
# One-liner to clear all caches
rm -rf apps/sentryvibe/.next apps/sentryvibe/node_modules/.cache node_modules/.cache && pnpm dev
```

**For Windows users:**
```powershell
# PowerShell one-liner
Remove-Item -Recurse -Force apps/sentryvibe/.next, apps/sentryvibe/node_modules/.cache, node_modules/.cache; pnpm dev
```

**Prevention:**

The `.next` directory is already added to `.gitignore` to prevent build cache from being committed to version control. When switching branches or pulling changes that refactor components, it's good practice to clear the cache:

```bash
git checkout main
git pull
rm -rf apps/sentryvibe/.next  # Clear cache after pulling changes
pnpm dev
```

---

#### Symptom: `useEffect` dependency array changed size between renders

**Example Warning:**
```
The final argument passed to useEffect changed size between renders.
[5, true, true, todos] → [5, true, true, todos, false]
```

**Root Cause:**

This is a React Rules violation where the dependency array of a `useEffect` hook is being dynamically constructed (changing number of elements between renders). This prevents React Fast Refresh from working properly.

**Solution:**

1. Clear the build cache (see above)
2. Review any `useEffect` hooks with dynamic dependencies - ensure the array has a stable length
3. Use ESLint rule `react-hooks/exhaustive-deps` to catch these issues during development

**Example Fix:**
```typescript
// ❌ BAD - Dynamic dependency array
const deps = [count, isEnabled];
if (shouldIncludeFlag) deps.push(flag);
useEffect(() => { ... }, deps);

// ✅ GOOD - Stable dependency array
useEffect(() => {
  if (!shouldIncludeFlag) return;
  // ... use flag
}, [count, isEnabled, shouldIncludeFlag, flag]);
```

---

## Additional Resources

- [Next.js Fast Refresh Documentation](https://nextjs.org/docs/architecture/fast-refresh)
- [React Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks)
- [Sentry Error Tracking](https://sentry.io/for/javascript/)

---

**Found a new issue?** Please contribute to this guide by submitting a PR with the solution!