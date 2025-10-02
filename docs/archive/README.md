# Archived Documentation

This directory contains documentation from earlier phases of development, when the integration used manual wrapping instead of SDK-level integration.

## Files

- **`SENTRY_SDK_INTEGRATION_PLAN.md`** (3051 lines) - Initial planning document for transitioning from manual wrapping to SDK integration
- **`SENTRY_CLAUDE_CODE_INTEGRATION.md`** (392 lines) - Technical documentation of the manual wrapping approach
- **`INTEGRATION_SUMMARY.md`** (299 lines) - Summary of manual integration implementation
- **`API_USAGE.md`** (227 lines) - API reference for manual wrapping
- **`QUICKSTART.md`** (189 lines) - Quick start guide for manual approach
- **`README_INTEGRATION.md`** (186 lines) - Integration overview

## Why Archived?

These docs describe the **manual wrapping approach** where users had to:
```javascript
import { instrumentClaudeCodeQuery } from './sentry-claude-code-integration.js';
const query = instrumentClaudeCodeQuery(originalQuery, options);
```

**Current approach** (SDK-level):
```typescript
import { createInstrumentedClaudeQuery } from '@sentry/node';
const query = createInstrumentedClaudeQuery();
```

The manual approach is obsolete now that the integration is part of the Sentry SDK.

## Historical Context

Development phases:
1. **Phase 1:** Manual wrapping in user code (`sentry-claude-code-integration.js`)
2. **Phase 2:** Attempted automatic OpenTelemetry instrumentation (failed due to ESM)
3. **Phase 3:** Helper function in SDK with lazy loading (current approach)

See the main [README.md](../../README.md) for current testing instructions.
