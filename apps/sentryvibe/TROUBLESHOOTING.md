# Troubleshooting Guide

This document provides solutions to common issues you may encounter when running SentryVibe.

## Table of Contents

- [Build and Cache Issues](#build-and-cache-issues)
- [Common Errors](#common-errors)

## Build and Cache Issues

### Stale Code / "Cannot convert undefined or null to object" Error

**Problem:** You're seeing errors like "Cannot convert undefined or null to object" or references to variables/types that don't exist in your current codebase (e.g., `CLAUDE_MODEL_METADATA`, `ClaudeModelId`, etc.).

**Root Cause:** This is a Next.js hot module reloading or stale build cache issue. The compiled/bundled code in the `.next` directory is outdated and references code that has been removed or changed in the source files.

**Solution:**

1. **Stop the development server** (if running) by pressing `Ctrl+C`

2. **Clean the Next.js build cache:**
   ```bash
   cd apps/sentryvibe
   pnpm run clean
   # or manually:
   rm -rf .next
   ```

3. **Restart the development server:**
   ```bash
   pnpm run dev
   ```

**Prevention:**

- When you see errors that reference code that doesn't exist in your source files, always try cleaning the build cache first
- After pulling major updates from git, consider running `pnpm run clean` before starting the dev server
- If you're switching between branches frequently, clean the cache between switches

### Hard Refresh Browser Cache

If cleaning the server cache doesn't resolve the issue, you may also need to clear your browser's cache:

**Chrome/Edge:**
- Windows/Linux: `Ctrl + Shift + R` or `Ctrl + F5`
- macOS: `Cmd + Shift + R`

**Firefox:**
- Windows/Linux: `Ctrl + Shift + R` or `Ctrl + F5`
- macOS: `Cmd + Shift + R`

**Safari:**
- macOS: `Cmd + Option + R`

Or completely clear browser cache:
1. Open DevTools (`F12` or `Cmd/Ctrl + Shift + I`)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"

## Common Errors

### TypeError: Cannot convert undefined or null to object

**Likely Cause:** Stale Next.js build cache

**Solution:** Follow the [Stale Code](#stale-code--cannot-convert-undefined-or-null-to-object-error) solution above.

### Module not found errors after updating dependencies

**Problem:** Getting "Module not found" errors after updating packages.

**Solution:**

1. Clean everything:
   ```bash
   cd apps/sentryvibe
   pnpm run clean
   rm -rf node_modules
   ```

2. Reinstall dependencies:
   ```bash
   cd ../../  # back to root
   pnpm install
   ```

3. Restart dev server:
   ```bash
   cd apps/sentryvibe
   pnpm run dev
   ```

### Port already in use

**Problem:** `Error: listen EADDRINUSE: address already in use :::3000`

**Solution:**

1. Find the process using the port:
   ```bash
   # On macOS/Linux:
   lsof -ti:3000
   
   # On Windows:
   netstat -ano | findstr :3000
   ```

2. Kill the process:
   ```bash
   # On macOS/Linux:
   kill -9 $(lsof -ti:3000)
   
   # On Windows:
   taskkill /PID <PID> /F
   ```

3. Or use a different port:
   ```bash
   PORT=3001 pnpm run dev
   ```

## Getting Help

If you're still experiencing issues after trying these solutions:

1. Check the [GitHub Issues](https://github.com/codyde/sentryvibe/issues) for similar problems
2. Create a new issue with:
   - Detailed error message
   - Steps to reproduce
   - Your environment (OS, Node version, etc.)
   - Relevant logs or screenshots

## Development Best Practices

To avoid common issues:

- **Always clean the cache** after major code changes or when pulling updates
- **Use the correct Node version** (18.0.0 or higher)
- **Keep dependencies updated** but test after updates
- **Monitor the console** for warnings during development
- **Clear browser cache** when frontend issues persist after fixes