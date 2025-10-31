# Release Notes - v0.10.4

**Release Date:** October 31, 2025

## 🎯 Overview

This release focuses on enhanced observability through Sentry metrics integration and critical bug fixes. We've added comprehensive metrics tracking for key user actions and system events, plus resolved a critical SQL query bug.

## ✨ What's New

### Sentry Metrics Integration
- **Project Lifecycle Tracking**: Added metrics for project creation, deletion, and completion events
- **Tag Selection Monitoring**: Track which frameworks and features users select most often
- **Tunnel Startup Metrics**: Monitor runner connection health and startup times
- **API Metrics Support**: Updated Sentry vendor packages to support the latest metrics API

### Enhanced Metadata Handling
- **Structured Tags Enforcement**: Improved request handling to ensure consistent tag structure in project metadata
- **Better Type Safety**: Strengthened validation for project configuration data

## 🐛 Bug Fixes

- **Critical SQL Fix**: Corrected table name from `message` to `messages` in message insertion queries, resolving database errors during build communication
  - Impact: This was causing silent failures in build message logging
  - Severity: High

## 📦 Technical Details

### Updated Dependencies
- Sentry vendor packages updated to support metrics instrumentation
- `@sentry/core` - Updated for metrics support
- `@sentry/node` - Updated for metrics support  
- `@sentry/node-core` - Updated for metrics support
- `@sentry/nextjs` - Updated for metrics support

### Metrics Being Tracked
```typescript
// Tag Selection
metrics.increment('tag.selected', { tag: tagName, category: tagCategory })

// Project Lifecycle
metrics.increment('project.created')
metrics.increment('project.deleted')
metrics.increment('project.completed')

// Runner Health
metrics.timing('tunnel.startup', startupDuration)
```

## 🔍 Context

These changes improve our ability to:
1. **Monitor User Behavior**: Understand which frameworks and features are most popular
2. **Track System Health**: Identify performance bottlenecks in tunnel connections
3. **Debug Issues**: Better trace project lifecycle events through Sentry
4. **Prevent Data Loss**: SQL fix ensures all build messages are properly stored

## 📊 Impact

- **Performance**: No negative impact; metrics are recorded asynchronously
- **Database**: Fixed critical bug in message storage
- **Observability**: Significantly improved with comprehensive metrics

## 🚀 Upgrade Notes

This is a patch release (0.10.3 → 0.10.4) with no breaking changes. Simply pull the latest version:

```bash
# Update the CLI
npm install -g @sentryvibe/runner-cli@0.10.4

# Or use the upgrade command
sentryvibe upgrade
```

## 🔗 Related PRs

Recent merged work that contributed to this release:
- #100 - Message query update
- #99 - Fixing route  
- #97 - Refactor: Adjust layout and sizing for responsiveness

## 📝 Commits Since v0.10.3

- `2c90da5` - Update request handling to enforce structured tags in project metadata
- `b304922` - Enable metrics and add project lifecycle tracking
- `c78fb65` - Update Sentry vendor packages to support metrics API
- `55d325c` - Add Sentry metrics instrumentation for tag selection, project deletion, and tunnel startup
- `44ea59f` - Fix SQL table name in message insertion query from 'message' to 'messages' in build route

---

**Full Changelog**: https://github.com/codyde/sentryvibe/compare/v0.10.3...v0.10.4

