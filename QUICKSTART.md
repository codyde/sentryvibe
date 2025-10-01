# Quick Start: Testing Sentry Claude Code Integration

## What You Need

Your Next.js app is already configured! Here's what's set up:

✅ `sentry-claude-code-integration.js` - The integration module
✅ `src/app/api/claude-agent/route.ts` - Instrumented with Sentry
✅ `sentry.server.config.ts` - Debug enabled, PII enabled

## Test It Now

### 1. Start the Dev Server

```bash
npm run dev
```

### 2. Make a Request Through Your UI

Navigate to your app and send a message to Claude through your chat interface.

### 3. Watch the Console

You should see Sentry debug logs like:

```
Sentry Logger [log]: [Tracing] Starting sampled span
  op: gen_ai.invoke_agent
  name: query claude-sonnet-4-5
  ID: abc123...
  parent ID: xyz789...
```

### 4. Check Sentry Dashboard

Go to: https://o4508130833793024.ingest.us.sentry.io/performance/

Look for:
- Transaction: Your API route (`/api/claude-agent`)
- Span: `query claude-sonnet-4-5` (op: `gen_ai.invoke_agent`)

Click into the span to see captured data:
- `gen_ai.request.messages` - Your prompt
- `gen_ai.response.text` - Claude's response
- `gen_ai.response.tool_calls` - Any tools Claude used
- `gen_ai.usage.*` - Token counts + cache metrics

## Example Expected Output

### Console Logs

```
📨 Received request to /api/claude-agent
💬 Processing 1 message(s)
🎯 Creating instrumented Claude Code query...

Sentry Logger [log]: [Tracing] Starting sampled span
  op: gen_ai.invoke_agent
  name: query claude-sonnet-4-5
  ID: cc9ef8c91d0ad277
  parent ID: bf6d83748fd4e320

📦 Agent Message: {
  "type": "system",
  "subtype": "init",
  ...
}

📦 Agent Message: {
  "type": "assistant",
  "message": {
    "content": [
      { "type": "text", "text": "Sure! I'll help you..." },
      { "type": "tool_use", "id": "...", "name": "Glob", ... }
    ]
  }
}

Sentry Logger [log]: [Tracing] Finishing "gen_ai.invoke_agent" span
```

### Sentry Dashboard

**Transaction:** `POST /api/claude-agent`
- **Span 1:** `query claude-sonnet-4-5` (gen_ai.invoke_agent)
  - Duration: ~2.5s
  - Attributes:
    - gen_ai.system: "claude-code"
    - gen_ai.request.model: "claude-sonnet-4-5"
    - gen_ai.request.messages: "[{...}]"
    - gen_ai.response.text: "..."
    - gen_ai.response.tool_calls: "[{...}]"
    - gen_ai.usage.input_tokens: 15
    - gen_ai.usage.output_tokens: 127
    - gen_ai.usage.cache_read_input_tokens: 15561

## Verify Captured Data

### Check Prompt Capture

1. Go to Sentry span details
2. Look for `gen_ai.request.messages`
3. Should see your actual prompt JSON

### Check Response Capture

1. Look for `gen_ai.response.text`
2. Should see Claude's actual response

### Check Tool Call Capture

1. Look for `gen_ai.response.tool_calls`
2. Should see array of tool_use objects with:
   - `type: "tool_use"`
   - `id: "toolu_..."`
   - `name: "ToolName"`
   - `input: {...}`

### Check Token Usage

Look for all these attributes:
- `gen_ai.usage.input_tokens`
- `gen_ai.usage.output_tokens`
- `gen_ai.usage.total_tokens`
- `gen_ai.usage.cache_creation_input_tokens`
- `gen_ai.usage.cache_read_input_tokens`

## Troubleshooting

### No spans appearing?

Check Sentry config:
```typescript
// sentry.server.config.ts
Sentry.init({
  tracesSampleRate: 1.0, // ← Must be > 0
  debug: true,           // ← Should see logs
  sendDefaultPii: true,  // ← Required for data capture
});
```

### No prompts/responses captured?

Check instrumentation options:
```typescript
// route.ts
const query = instrumentClaudeCodeQuery(originalQuery, {
  recordInputs: true,   // ← Must be true
  recordOutputs: true,  // ← Must be true
});
```

### Errors in console?

Check import path:
```typescript
import { instrumentClaudeCodeQuery } from '../../../../sentry-claude-code-integration.js';
//                                        ^^^^^ Adjust relative path if needed
```

## Next Steps

Once you see spans appearing:

1. **Test different scenarios:**
   - Simple text responses
   - Tool usage (file reads, commands)
   - Multi-turn conversations
   - Error cases

2. **Check Sentry performance:**
   - Look for slow spans
   - Monitor token usage trends
   - Track cache hit rates

3. **Refine settings:**
   - Adjust `tracesSampleRate` for production
   - Configure `recordInputs/recordOutputs` per environment
   - Set up alerts for high token usage

4. **Share with team:**
   - Show them the captured data
   - Explain the trace hierarchy
   - Demo tool call visibility

## Questions?

Check `SENTRY_CLAUDE_CODE_INTEGRATION.md` for full documentation!
