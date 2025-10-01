# Sentry SDK Integration Plan - Claude Code SDK
**Date Created:** September 30, 2025
**Status:** Planning Phase
**Goal:** Integrate Claude Code SDK monitoring into official `@sentry/node` with automatic instrumentation

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Current State](#current-state)
3. [Target State](#target-state)
4. [Technical Architecture](#technical-architecture)
5. [Implementation Plan](#implementation-plan)
6. [Testing Strategy](#testing-strategy)
7. [Documentation Requirements](#documentation-requirements)
8. [Sentry PR Submission Guide](#sentry-pr-submission-guide)
9. [Timeline & Milestones](#timeline--milestones)
10. [Risk Assessment](#risk-assessment)

---

## Executive Summary

### What We Have
A **production-ready, manually-wrapped integration** for Claude Code SDK that:
- ✅ Captures prompts, responses, tool calls, and token usage
- ✅ Creates proper OpenTelemetry-compliant spans
- ✅ Follows Sentry's Anthropic AI integration pattern
- ✅ Is fully tested and documented
- ✅ Works in production Next.js API routes

### What We Need
Transform this into an **official Sentry SDK integration** with:
- 🎯 **Automatic instrumentation** (no manual wrapping)
- 🎯 **Module patching** (like `anthropicAIIntegration`)
- 🎯 **Integration class** following Sentry's patterns
- 🎯 **TypeScript definitions** with full type safety
- 🎯 **Comprehensive tests** matching Sentry's standards
- 🎯 **Official documentation** in Sentry's format

### Developer Experience Target

**CRITICAL REQUIREMENT: Zero changes to how users write Claude Code SDK code.**

**❌ CURRENT STATE (manual wrapping - requires code changes):**
```typescript
import { query as originalQuery } from '@anthropic-ai/claude-agent-sdk';
import { instrumentClaudeCodeQuery } from './sentry-claude-code-integration.js';

// User has to manually wrap the query function
const query = instrumentClaudeCodeQuery(originalQuery, {
  recordInputs: true,
  recordOutputs: true,
});

for await (const msg of query({ prompt: 'Hello' })) {
  console.log(msg);
}
```

**✅ TARGET STATE (automatic patching - no code changes needed):**
```typescript
import * as Sentry from '@sentry/node';
import { query } from '@anthropic-ai/claude-agent-sdk';  // ← Normal import

// ONE-TIME SETUP: Just add the integration to Sentry.init()
Sentry.init({
  dsn: 'your-dsn',
  sendDefaultPii: true,
  integrations: [
    Sentry.claudeCodeIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
  ],
});

// ✨ THAT'S IT! The SDK code below is 100% unchanged
// query() is automatically instrumented behind the scenes
for await (const msg of query({ prompt: 'Hello' })) {
  console.log(msg);
}
```

**How the magic works:**
1. User calls `Sentry.init()` with `claudeCodeIntegration()`
2. Integration's `setupOnce()` method runs
3. OpenTelemetry patches the `query` function in `@anthropic-ai/claude-agent-sdk` module
4. When user imports `query`, they get the **already-patched version**
5. All calls to `query()` are automatically wrapped with Sentry instrumentation
6. User's SDK usage code **never changes**

**The Promise:** Users add one line to their Sentry config, and their entire Claude Code SDK usage is automatically monitored. No refactoring, no wrapper functions, no manual instrumentation.

---

## Current State

### File Structure
```
sentryvibe/
├── sentry-claude-code-integration.js    # Core integration (462 lines)
├── src/app/api/claude-agent/route.ts    # Example usage in Next.js
├── sentry.server.config.ts              # Sentry configuration
├── SENTRY_CLAUDE_CODE_INTEGRATION.md    # Technical documentation
├── QUICKSTART.md                        # Testing guide
├── INTEGRATION_SUMMARY.md               # Project summary
├── README_INTEGRATION.md                # Overview
└── test-*.js                            # 5 test files
```

### Core Implementation Details

#### 1. **Wrapping Function** (`instrumentClaudeCodeQuery`)
```javascript
export function instrumentClaudeCodeQuery(originalQueryFn, options = {}) {
  const client = getClient();
  const defaultPii = Boolean(client?.getOptions().sendDefaultPii);

  const recordInputs = options.recordInputs ?? defaultPii;
  const recordOutputs = options.recordOutputs ?? defaultPii;

  return function instrumentedQuery({ prompt, options: queryOptions, inputMessages }) {
    const model = queryOptions?.model ?? 'sonnet';
    const originalQuery = originalQueryFn({ prompt, options: queryOptions });

    const instrumentedGenerator = createInstrumentedGenerator(
      originalQuery,
      prompt,
      model,
      { recordInputs, recordOutputs, inputMessages }
    );

    // Preserve Query interface methods
    if (typeof originalQuery.interrupt === 'function') {
      instrumentedGenerator.interrupt = originalQuery.interrupt.bind(originalQuery);
    }
    if (typeof originalQuery.setPermissionMode === 'function') {
      instrumentedGenerator.setPermissionMode = originalQuery.setPermissionMode.bind(originalQuery);
    }

    return instrumentedGenerator;
  };
}
```

#### 2. **Span Creation** (`createInstrumentedGenerator`)
```javascript
function createInstrumentedGenerator(originalQuery, prompt, model, instrumentationOptions) {
  return startSpanManual(
    {
      name: `invoke_agent claude-code`,
      op: 'gen_ai.invoke_agent',
      attributes: {
        [GEN_AI_ATTRIBUTES.SYSTEM]: 'claude-code',
        [GEN_AI_ATTRIBUTES.REQUEST_MODEL]: model,
        [GEN_AI_ATTRIBUTES.OPERATION_NAME]: 'invoke_agent',
        'gen_ai.agent.name': 'claude-code',
        'sentry.origin': SENTRY_ORIGIN,
      },
    },
    async function* (span) {
      // State tracking
      let sessionId = null;
      let currentLLMSpan = null;
      let currentTurnContent = '';
      let currentTurnTools = [];
      let currentTurnId = null;
      let currentTurnModel = null;
      let inputMessagesCaptured = false;
      let finalResult = null;
      let previousLLMSpan = null;
      let previousTurnTools = [];

      try {
        for await (const message of originalQuery) {
          // Handle different message types:
          // - system: Extract session_id, capture conversation_history
          // - assistant: Accumulate content and tool_use blocks
          // - user: Create execute_tool spans for tool_result blocks
          // - result: Finalize LLM span, capture final result
          // - error: Set error status

          yield message;
        }

        // Set final result and session ID on parent span
        // Mark as successful
        span.setStatus({ code: 1 });
      } catch (error) {
        span.setStatus({ code: 2, message: error.message });
        throw error;
      } finally {
        span.end();
      }
    }
  );
}
```

#### 3. **Span Hierarchy**
```
invoke_agent claude-code (parent)
  ├─ Attributes: system, model, operation, agent name
  ├─ Input: conversation_history OR inputMessages
  ├─ Output: finalResult, session_id
  │
  ├─ gen_ai.chat (LLM turn 1)
  │   ├─ Attributes: system, model, operation
  │   ├─ Input: inputMessages (system + user messages)
  │   ├─ Output: text, tool_calls, response_id, model
  │   ├─ Usage: input_tokens, output_tokens, total_tokens
  │   │
  │   ├─ gen_ai.execute_tool (tool 1)
  │   │   ├─ Attributes: system, model, operation, tool.name
  │   │   ├─ Input: tool.input
  │   │   └─ Output: tool.output
  │   │
  │   └─ gen_ai.execute_tool (tool 2)
  │       └─ ...
  │
  └─ gen_ai.chat (LLM turn 2)
      └─ ...
```

#### 4. **OpenTelemetry Semantic Conventions**
```javascript
const GEN_AI_ATTRIBUTES = {
  SYSTEM: 'gen_ai.system',                      // "claude-code"
  OPERATION_NAME: 'gen_ai.operation.name',      // "invoke_agent" | "chat" | "execute_tool"
  REQUEST_MODEL: 'gen_ai.request.model',        // "claude-sonnet-4-5"
  REQUEST_MESSAGES: 'gen_ai.request.messages',  // JSON array of messages
  RESPONSE_TEXT: 'gen_ai.response.text',        // Assistant's text response
  RESPONSE_TOOL_CALLS: 'gen_ai.response.tool_calls', // JSON array of tool_use
  RESPONSE_ID: 'gen_ai.response.id',            // Session/message ID
  RESPONSE_MODEL: 'gen_ai.response.model',      // Actual model used
  USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
  USAGE_TOTAL_TOKENS: 'gen_ai.usage.total_tokens', // input + output + cache_creation + cache_read
};
```

#### 5. **Message Flow & State Management**

**Message Types from Claude Code SDK:**
```typescript
type SDKMessage =
  | { type: 'system', subtype: 'init', session_id: string, conversation_history?: MessageParam[] }
  | { type: 'assistant', message: { id: string, model: string, content: ContentBlock[] } }
  | { type: 'user', message: { content: ContentBlock[] } }
  | { type: 'result', result: string, usage: UsageInfo }
  | { type: 'error', error: any };

type ContentBlock =
  | { type: 'text', text: string }
  | { type: 'tool_use', id: string, name: string, input: any }
  | { type: 'tool_result', tool_use_id: string, content: any, is_error?: boolean };
```

**State Accumulation Logic:**
1. **system message**: Capture `session_id`, optionally capture `conversation_history` as input
2. **assistant message (first in turn)**:
   - Create new `gen_ai.chat` span as child of invoke_agent
   - Set input messages on chat span
   - Initialize accumulation state
3. **assistant message (subsequent)**: Accumulate `text` content and `tool_use` blocks
4. **user message**: Create `gen_ai.execute_tool` spans for each `tool_result` block
5. **result message**:
   - Finalize current LLM span with accumulated data
   - Set usage tokens
   - Capture final result for parent span
6. **error message**: Set error status on span

**Key State Variables:**
- `currentLLMSpan`: Active LLM turn span being accumulated
- `previousLLMSpan`: Previous LLM span (kept for tool result matching)
- `currentTurnContent`: Accumulated text content for current turn
- `currentTurnTools`: Accumulated tool_use blocks for current turn
- `previousTurnTools`: Tool calls from previous turn (for delayed tool results)
- `sessionId`: Session identifier from system message
- `inputMessagesCaptured`: Flag to prevent duplicate input capture

#### 6. **Token Usage Calculation**
```javascript
function setTokenUsageAttributes(span, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens) {
  const attrs = {};

  if (typeof inputTokens === 'number') {
    attrs[GEN_AI_ATTRIBUTES.USAGE_INPUT_TOKENS] = inputTokens;
  }
  if (typeof outputTokens === 'number') {
    attrs[GEN_AI_ATTRIBUTES.USAGE_OUTPUT_TOKENS] = outputTokens;
  }

  // IMPORTANT: Total includes ALL token types
  const total = (inputTokens ?? 0) + (outputTokens ?? 0) +
                (cacheCreationTokens ?? 0) + (cacheReadTokens ?? 0);
  if (total > 0) {
    attrs[GEN_AI_ATTRIBUTES.USAGE_TOTAL_TOKENS] = total;
  }

  if (Object.keys(attrs).length > 0) {
    span.setAttributes(attrs);
  }
}
```

**Note:** Sentry's Anthropic integration includes cache tokens in `total_tokens` but doesn't expose them as separate attributes. We follow the same pattern.

#### 7. **PII Control**
```javascript
const client = getClient();
const defaultPii = Boolean(client?.getOptions().sendDefaultPii);

const recordInputs = options.recordInputs ?? defaultPii;
const recordOutputs = options.recordOutputs ?? defaultPii;
```

- `recordInputs`: Controls capture of `gen_ai.request.messages` and `gen_ai.tool.input`
- `recordOutputs`: Controls capture of `gen_ai.response.text`, `gen_ai.response.tool_calls`, and `gen_ai.tool.output`
- Defaults to Sentry's `sendDefaultPii` setting
- Can be overridden per-integration

### Current Usage Pattern (Manual Wrapping)

```typescript
// src/app/api/claude-agent/route.ts
import { query as originalQuery } from '@anthropic-ai/claude-agent-sdk';
import { instrumentClaudeCodeQuery } from '../../../../sentry-claude-code-integration.js';

const query = instrumentClaudeCodeQuery(originalQuery, {
  recordInputs: true,
  recordOutputs: true,
});

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Convert messages to format for Sentry
  const inputMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(convertUIMessageToAnthropicFormat)
  ];

  const agentStream = query({
    prompt: lastUserMessage.parts.find(p => p.type === 'text')?.text || 'Continue',
    inputMessages: inputMessages, // For Sentry only
    options: {
      model: 'claude-sonnet-4-5',
      cwd: '/path/to/working/dir',
      permissionMode: 'bypassPermissions',
      maxTurns: 10,
      systemPrompt: systemPrompt,
    },
  });

  for await (const message of agentStream) {
    // Process messages...
  }
}
```

**Key Points:**
- Manual import and wrapping required
- `inputMessages` parameter added for Sentry (not passed to SDK)
- Must wrap in every file that uses `query()`

---

## Target State

### Integration Structure in Sentry SDK

Following the exact pattern from `@sentry/node/src/integrations/tracing/anthropic-ai`:

```
@sentry/node/src/integrations/tracing/claude-code/
├── index.ts                      # Main integration export
├── instrumentation.ts            # OpenTelemetry instrumentation class
├── utils.ts                      # Helper functions (span creation, attribute setting)
└── types.ts                      # TypeScript type definitions
```

### 1. Integration Definition (`index.ts`)

```typescript
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn, Client } from '@sentry/types';
import { SentryClaudeCodeInstrumentation } from './instrumentation';

const INTEGRATION_NAME = 'ClaudeCode';

interface ClaudeCodeIntegrationOptions {
  /**
   * Whether to capture prompts and user messages.
   * Defaults to Sentry client's `sendDefaultPii` setting.
   */
  recordInputs?: boolean;

  /**
   * Whether to capture LLM responses, tool calls, and tool outputs.
   * Defaults to Sentry client's `sendDefaultPii` setting.
   */
  recordOutputs?: boolean;

  /**
   * Package name to instrument.
   * Use this if you have multiple claude-code packages or custom imports.
   * @default '@anthropic-ai/claude-agent-sdk'
   */
  packageName?: string;
}

const _claudeCodeIntegration = ((options: ClaudeCodeIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // This is called once when the integration is added
      // OpenTelemetry instrumentation is registered here
      const instrumentation = new SentryClaudeCodeInstrumentation(options);
      instrumentation.enable();
    },
    setup(client: Client) {
      // Per-client setup if needed
      // Can access client.getOptions() here
    },
  };
}) satisfies IntegrationFn;

export const claudeCodeIntegration = defineIntegration(_claudeCodeIntegration);

/**
 * Claude Code SDK integration for Sentry.
 *
 * Automatically instruments the Claude Code SDK to capture:
 * - User prompts and assistant responses
 * - Tool calls with inputs and outputs
 * - Token usage including cache metrics
 * - Multi-turn conversations
 * - Session tracking
 *
 * @example
 * ```typescript
 * import * as Sentry from '@sentry/node';
 *
 * Sentry.init({
 *   dsn: 'your-dsn',
 *   sendDefaultPii: true, // Required to capture prompts/responses by default
 *   integrations: [
 *     Sentry.claudeCodeIntegration({
 *       recordInputs: true,  // Capture prompts
 *       recordOutputs: true, // Capture responses
 *     }),
 *   ],
 * });
 *
 * // Now use Claude Code SDK normally - it's automatically instrumented!
 * import { query } from '@anthropic-ai/claude-agent-sdk';
 *
 * for await (const msg of query({ prompt: 'Hello!' })) {
 *   console.log(msg);
 * }
 * ```
 */
export { claudeCodeIntegration as default };
```

### 2. OpenTelemetry Instrumentation (`instrumentation.ts`)

```typescript
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import type { Span } from '@opentelemetry/api';
import { getClient, startSpanManual, getActiveSpan, startSpan, withActiveSpan } from '@sentry/core';

const PACKAGE_NAME = '@anthropic-ai/claude-agent-sdk';
const SENTRY_ORIGIN = 'auto.ai.claude-code';

interface ClaudeCodeInstrumentationOptions {
  recordInputs?: boolean;
  recordOutputs?: boolean;
  packageName?: string;
}

export class SentryClaudeCodeInstrumentation extends InstrumentationBase {
  constructor(options: ClaudeCodeInstrumentationOptions = {}) {
    super(
      'sentry-instrumentation-claude-code',
      '1.0.0',
      options
    );
  }

  init() {
    const packageName = this._config.packageName || PACKAGE_NAME;

    return [
      new InstrumentationNodeModuleDefinition(
        packageName,
        ['*'], // Support all versions
        (moduleExports: any) => {
          this._wrap(moduleExports, 'query', this._patchQuery.bind(this));
          return moduleExports;
        },
        (moduleExports: any) => {
          this._unwrap(moduleExports, 'query');
          return moduleExports;
        }
      ),
    ];
  }

  private _patchQuery(originalQuery: Function) {
    const instrumentation = this;
    const options = this._config as ClaudeCodeInstrumentationOptions;

    return function patchedQuery(this: any, ...args: any[]) {
      // Get options from Sentry client
      const client = getClient();
      const defaultPii = Boolean(client?.getOptions().sendDefaultPii);

      const recordInputs = options.recordInputs ?? defaultPii;
      const recordOutputs = options.recordOutputs ?? defaultPii;

      // Parse query arguments
      const [queryParams] = args;
      const { prompt, options: queryOptions, inputMessages } = queryParams || {};
      const model = queryOptions?.model ?? 'sonnet';

      // Create original query instance
      const originalQueryInstance = originalQuery.apply(this, args);

      // Create instrumented generator
      const instrumentedGenerator = instrumentation._createInstrumentedGenerator(
        originalQueryInstance,
        prompt,
        model,
        { recordInputs, recordOutputs, inputMessages }
      );

      // Preserve Query interface methods
      if (typeof originalQueryInstance.interrupt === 'function') {
        instrumentedGenerator.interrupt = originalQueryInstance.interrupt.bind(originalQueryInstance);
      }
      if (typeof originalQueryInstance.setPermissionMode === 'function') {
        instrumentedGenerator.setPermissionMode = originalQueryInstance.setPermissionMode.bind(originalQueryInstance);
      }

      return instrumentedGenerator;
    };
  }

  private _createInstrumentedGenerator(
    originalQuery: AsyncGenerator,
    prompt: any,
    model: string,
    instrumentationOptions: any
  ) {
    // This is where the current createInstrumentedGenerator logic goes
    // See "Current State" section above for full implementation

    return startSpanManual(
      {
        name: `invoke_agent claude-code`,
        op: 'gen_ai.invoke_agent',
        attributes: {
          'gen_ai.system': 'claude-code',
          'gen_ai.request.model': model,
          'gen_ai.operation.name': 'invoke_agent',
          'gen_ai.agent.name': 'claude-code',
          'sentry.origin': SENTRY_ORIGIN,
        },
      },
      async function* (span: Span) {
        // Full message processing logic here
        // (Copy from current implementation in sentry-claude-code-integration.js)

        try {
          for await (const message of originalQuery) {
            // Process message, create child spans, accumulate data
            yield message;
          }
          span.setStatus({ code: 1 });
        } catch (error) {
          span.setStatus({ code: 2, message: error.message });
          throw error;
        } finally {
          span.end();
        }
      }
    );
  }
}
```

### 3. Utility Functions (`utils.ts`)

```typescript
const GEN_AI_ATTRIBUTES = {
  SYSTEM: 'gen_ai.system',
  OPERATION_NAME: 'gen_ai.operation.name',
  REQUEST_MODEL: 'gen_ai.request.model',
  REQUEST_MESSAGES: 'gen_ai.request.messages',
  RESPONSE_TEXT: 'gen_ai.response.text',
  RESPONSE_TOOL_CALLS: 'gen_ai.response.tool_calls',
  RESPONSE_ID: 'gen_ai.response.id',
  RESPONSE_MODEL: 'gen_ai.response.model',
  USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
  USAGE_TOTAL_TOKENS: 'gen_ai.usage.total_tokens',
};

export function setTokenUsageAttributes(
  span: Span,
  inputTokens?: number,
  outputTokens?: number,
  cacheCreationTokens?: number,
  cacheReadTokens?: number
): void {
  const attrs: Record<string, number> = {};

  if (typeof inputTokens === 'number') {
    attrs[GEN_AI_ATTRIBUTES.USAGE_INPUT_TOKENS] = inputTokens;
  }
  if (typeof outputTokens === 'number') {
    attrs[GEN_AI_ATTRIBUTES.USAGE_OUTPUT_TOKENS] = outputTokens;
  }

  const total = (inputTokens ?? 0) + (outputTokens ?? 0) +
                (cacheCreationTokens ?? 0) + (cacheReadTokens ?? 0);
  if (total > 0) {
    attrs[GEN_AI_ATTRIBUTES.USAGE_TOTAL_TOKENS] = total;
  }

  if (Object.keys(attrs).length > 0) {
    span.setAttributes(attrs);
  }
}

// Additional utility functions as needed
```

### 4. Type Definitions (`types.ts`)

```typescript
import type { MessageParam } from '@anthropic-ai/sdk/resources';

export interface SDKMessage {
  type: 'system' | 'assistant' | 'user' | 'result' | 'error';
  subtype?: 'init';
  session_id?: string;
  conversation_history?: MessageParam[];
  message?: {
    id?: string;
    model?: string;
    content?: ContentBlock[];
  };
  result?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  error?: any;
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: any;
  tool_use_id?: string;
  content?: any;
  is_error?: boolean;
}

export interface Query extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<void>;
  setPermissionMode(mode: string): Promise<void>;
}
```

### 5. Export from Main Package

```typescript
// @sentry/node/src/index.ts
export { claudeCodeIntegration } from './integrations/tracing/claude-code';

// @sentry/node/src/types/index.ts
export type { ClaudeCodeIntegrationOptions } from './integrations/tracing/claude-code';
```

### Target Usage Pattern (Automatic Instrumentation)

```typescript
// User's application code
import * as Sentry from '@sentry/node';
import { query } from '@anthropic-ai/claude-agent-sdk';

// Initialize Sentry with Claude Code integration
Sentry.init({
  dsn: 'your-dsn',
  sendDefaultPii: true,
  integrations: [
    Sentry.claudeCodeIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
  ],
});

// Use Claude Code SDK normally - automatically instrumented!
export async function handler(req: Request) {
  const agentStream = query({
    prompt: 'Hello, how are you?',
    options: {
      model: 'claude-sonnet-4-5',
      maxTurns: 10,
    },
  });

  for await (const message of agentStream) {
    console.log(message);
  }
}
```

**Key Improvements:**
- ✅ No manual wrapping required
- ✅ No need to import integration file
- ✅ Works across entire application automatically
- ✅ Matches Anthropic AI integration DX exactly

---

## Technical Architecture

### Module Patching Strategy

#### How Module Patching Works

OpenTelemetry's `InstrumentationBase` provides infrastructure for patching Node.js modules:

```typescript
// When module is loaded (require/import)
new InstrumentationNodeModuleDefinition(
  '@anthropic-ai/claude-agent-sdk',  // Package name
  ['*'],                              // Version range (all versions)
  (moduleExports) => {
    // PATCH: Replace original function
    this._wrap(moduleExports, 'query', this._patchQuery.bind(this));
    return moduleExports;
  },
  (moduleExports) => {
    // UNPATCH: Restore original function (for cleanup)
    this._unwrap(moduleExports, 'query');
    return moduleExports;
  }
);
```

#### The `_wrap` Method

```typescript
// From @opentelemetry/instrumentation
protected _wrap<T>(
  moduleExports: T,
  name: string,
  wrapper: (original: any) => any
): void {
  // 1. Get original function
  const original = moduleExports[name];

  // 2. Store original for later unwrapping
  this._originalFunctions.set({ moduleExports, name }, original);

  // 3. Replace with wrapped version
  moduleExports[name] = wrapper(original);
}
```

#### Our Wrapper Implementation

```typescript
private _patchQuery(originalQuery: Function) {
  const instrumentation = this;
  const options = this._config;

  // This function replaces the original query()
  return function patchedQuery(this: any, ...args: any[]) {
    // Extract query parameters
    const [queryParams] = args;
    const { prompt, options: queryOptions } = queryParams || {};

    // Call original to get the Query instance
    const originalQueryInstance = originalQuery.apply(this, args);

    // Wrap in instrumentation
    const instrumentedGenerator = instrumentation._createInstrumentedGenerator(
      originalQueryInstance,
      prompt,
      queryOptions?.model ?? 'sonnet',
      options
    );

    // Preserve methods
    instrumentedGenerator.interrupt = originalQueryInstance.interrupt?.bind(originalQueryInstance);
    instrumentedGenerator.setPermissionMode = originalQueryInstance.setPermissionMode?.bind(originalQueryInstance);

    return instrumentedGenerator;
  };
}
```

#### Why This Works

1. **Transparent to User**: User imports `query` normally, gets patched version
2. **Original Behavior**: Patched function calls original internally
3. **Method Preservation**: Methods are bound to original instance
4. **Generator Wrapping**: Instrumented generator wraps original generator
5. **Automatic**: Happens at module load time, no user action needed

### AsyncGenerator Wrapping Pattern

#### The Challenge

Claude Code SDK's `query()` returns:
```typescript
interface Query extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
}
```

We need to:
1. Intercept messages from the generator
2. Create spans based on message content
3. Preserve the Query interface methods
4. Maintain streaming behavior (no buffering)

#### The Solution

```typescript
function createInstrumentedGenerator(originalQuery, model, options) {
  return startSpanManual(
    {
      name: `invoke_agent claude-code`,
      op: 'gen_ai.invoke_agent',
      // ... attributes
    },
    async function* (span) {
      // State for accumulating data
      let currentLLMSpan = null;
      let accumulatedContent = '';
      let accumulatedTools = [];

      try {
        // Iterate through original generator
        for await (const message of originalQuery) {
          // Process message based on type
          switch (message.type) {
            case 'assistant':
              if (!currentLLMSpan) {
                // Start new LLM turn span
                currentLLMSpan = startLLMSpan(span);
              }
              // Accumulate content
              accumulatedContent += extractText(message);
              accumulatedTools.push(...extractTools(message));
              break;

            case 'result':
              if (currentLLMSpan) {
                // Finalize LLM span with accumulated data
                setSpanData(currentLLMSpan, accumulatedContent, accumulatedTools);
                currentLLMSpan.end();
                currentLLMSpan = null;
              }
              break;

            case 'user':
              // Create tool execution spans
              createToolSpans(message, currentLLMSpan);
              break;
          }

          // CRITICAL: Yield message immediately (streaming!)
          yield message;
        }

        span.setStatus({ code: 1 }); // Success
      } catch (error) {
        span.setStatus({ code: 2 }); // Error
        throw error;
      } finally {
        span.end();
      }
    }
  );
}
```

**Key Points:**
- Uses `startSpanManual` which accepts an async generator function
- State is accumulated within the generator function scope
- Messages are yielded immediately (no buffering)
- Spans are created/finalized based on message flow
- Error handling ensures spans are properly closed

### Span Creation Strategy

#### Parent Span: `invoke_agent`

Created at the start of query execution:

```typescript
{
  name: 'invoke_agent claude-code',
  op: 'gen_ai.invoke_agent',
  attributes: {
    'gen_ai.system': 'claude-code',
    'gen_ai.request.model': 'claude-sonnet-4-5',
    'gen_ai.operation.name': 'invoke_agent',
    'gen_ai.agent.name': 'claude-code',
    'sentry.origin': 'auto.ai.claude-code',
  },
}
```

**When to set attributes:**
- Start: model, system, operation, agent name
- During: conversation_history (from system message)
- End: final result, session_id

#### Child Span: `gen_ai.chat`

Created for each LLM turn:

```typescript
withActiveSpan(parentSpan, () => {
  return startSpanManual(
    {
      name: `chat ${model}`,
      op: 'gen_ai.chat',
      attributes: {
        'gen_ai.system': 'claude-code',
        'gen_ai.request.model': model,
        'gen_ai.operation.name': 'chat',
        'sentry.origin': SENTRY_ORIGIN,
      },
    },
    (childSpan) => {
      // Set input messages (system + user)
      if (recordInputs && inputMessages) {
        childSpan.setAttributes({
          'gen_ai.request.messages': JSON.stringify(inputMessages),
        });
      }

      return childSpan;
    }
  );
});
```

**When to set attributes:**
- Start: model, system, operation, input messages
- Accumulation: Collect text content and tool_use blocks
- Finalization (result message):
  - response.text (accumulated)
  - response.tool_calls (accumulated array)
  - response.id
  - response.model
  - usage tokens

**Why accumulation?**: Assistant messages are streamed in chunks. We need to collect all chunks before finalizing the span.

#### Grandchild Span: `gen_ai.execute_tool`

Created for each tool execution:

```typescript
withActiveSpan(llmSpan, () => {
  startSpan(
    {
      name: `execute_tool ${toolName}`,
      op: 'gen_ai.execute_tool',
      attributes: {
        'gen_ai.system': 'claude-code',
        'gen_ai.request.model': model,
        'gen_ai.operation.name': 'execute_tool',
        'gen_ai.agent.name': 'claude-code',
        'gen_ai.tool.name': toolName,
        'sentry.origin': SENTRY_ORIGIN,
      },
    },
    (toolSpan) => {
      // Set tool input
      if (recordInputs && toolCall.input) {
        toolSpan.setAttributes({
          'gen_ai.tool.input': JSON.stringify(toolCall.input),
        });
      }

      // Set tool output
      if (recordOutputs && toolResult.content) {
        toolSpan.setAttributes({
          'gen_ai.tool.output': typeof toolResult.content === 'string'
            ? toolResult.content
            : JSON.stringify(toolResult.content),
        });
      }

      // Set error status if tool failed
      if (toolResult.is_error) {
        toolSpan.setStatus({ code: 2, message: 'Tool execution error' });
      }
    }
  );
});
```

**When to create**: When processing user messages with `tool_result` blocks.

**Matching logic**: Find corresponding `tool_use` block by `tool_use_id`:
1. Check current turn's tools
2. If not found, check previous turn's tools
3. Create span as child of the LLM span that made the tool call

### State Management Deep Dive

#### Why State Tracking Is Necessary

The Claude Code SDK streams messages incrementally:

```typescript
// Turn 1: Assistant starts responding
{ type: 'assistant', message: { content: [{ type: 'text', text: 'Let me ' }] } }
{ type: 'assistant', message: { content: [{ type: 'text', text: 'help you' }] } }
{ type: 'assistant', message: { content: [{ type: 'tool_use', id: '123', name: 'Read', input: {...} }] } }
{ type: 'result', usage: { input_tokens: 100, output_tokens: 50 } }

// Turn 2: Tools are executed
{ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: '123', content: '...' }] } }

// Turn 3: Assistant continues
{ type: 'assistant', message: { content: [{ type: 'text', text: 'Based on' }] } }
{ type: 'assistant', message: { content: [{ type: 'text', text: ' the file...' }] } }
{ type: 'result', usage: { input_tokens: 150, output_tokens: 75 } }
```

We need to:
1. Accumulate all `assistant` messages until we see `result`
2. Keep track of which LLM turn the tool calls belong to
3. Match `tool_result` messages to their corresponding `tool_use` blocks
4. Handle delayed tool results (sometimes arrive after next LLM turn starts)

#### State Variables

```typescript
// Active span tracking
let currentLLMSpan = null;      // Currently open LLM turn span
let previousLLMSpan = null;     // Previous LLM span (for tool matching)

// Content accumulation (for current turn)
let currentTurnContent = '';    // Accumulated text content
let currentTurnTools = [];      // Accumulated tool_use blocks
let currentTurnId = null;       // Message ID
let currentTurnModel = null;    // Model name

// Tool tracking (for previous turn)
let previousTurnTools = [];     // Tool calls from previous turn

// Session tracking
let sessionId = null;           // Session ID from system message
let inputMessagesCaptured = false; // Prevent duplicate input capture
let finalResult = null;         // Final result for parent span
```

#### State Transitions

**1. System Message Arrives**
```typescript
if (message.type === 'system' && message.session_id) {
  sessionId = message.session_id;

  if (!inputMessagesCaptured && recordInputs && message.conversation_history) {
    parentSpan.setAttributes({
      'gen_ai.request.messages': JSON.stringify(message.conversation_history),
    });
    inputMessagesCaptured = true;
  }
}
```

**2. First Assistant Message in Turn**
```typescript
if (message.type === 'assistant') {
  // Close previous LLM span if it's still open (no tools were called)
  if (previousLLMSpan) {
    previousLLMSpan.setStatus({ code: 1 });
    previousLLMSpan.end();
    previousLLMSpan = null;
    previousTurnTools = [];
  }

  // Create new LLM span
  if (!currentLLMSpan) {
    currentLLMSpan = withActiveSpan(parentSpan, () => {
      return startSpanManual({
        name: `chat ${model}`,
        op: 'gen_ai.chat',
        // ... attributes
      }, (span) => {
        // Set input messages
        if (recordInputs && inputMessages) {
          span.setAttributes({
            'gen_ai.request.messages': JSON.stringify(inputMessages),
          });
        }
        return span;
      });
    });

    // Reset accumulation state
    currentTurnContent = '';
    currentTurnTools = [];
  }

  // Accumulate content from this message
  // (see next section)
}
```

**3. Subsequent Assistant Messages (Accumulation)**
```typescript
// Extract text content
const textContent = message.message.content
  .filter(c => c.type === 'text')
  .map(c => c.text)
  .join('');
if (textContent) {
  currentTurnContent += textContent;
}

// Extract tool calls
const tools = message.message.content.filter(c => c.type === 'tool_use');
if (tools.length > 0) {
  currentTurnTools.push(...tools);
}

// Store metadata (last one wins)
if (message.message.id) currentTurnId = message.message.id;
if (message.message.model) currentTurnModel = message.message.model;
```

**4. Result Message (Finalization)**
```typescript
if (message.type === 'result') {
  // Capture final result
  if (message.result) {
    finalResult = message.result;
  }

  // Close previous LLM span if still open
  if (previousLLMSpan) {
    previousLLMSpan.setStatus({ code: 1 });
    previousLLMSpan.end();
    previousLLMSpan = null;
    previousTurnTools = [];
  }

  // Finalize current LLM span
  if (currentLLMSpan) {
    // Set accumulated response
    if (recordOutputs && currentTurnContent) {
      currentLLMSpan.setAttributes({
        'gen_ai.response.text': currentTurnContent,
      });
    }

    // Set tool calls
    if (recordOutputs && currentTurnTools.length > 0) {
      currentLLMSpan.setAttributes({
        'gen_ai.response.tool_calls': JSON.stringify(currentTurnTools),
      });
    }

    // Set metadata
    if (currentTurnId) {
      currentLLMSpan.setAttributes({ 'gen_ai.response.id': currentTurnId });
    }
    if (currentTurnModel) {
      currentLLMSpan.setAttributes({ 'gen_ai.response.model': currentTurnModel });
    }

    // Set token usage
    if (message.usage) {
      setTokenUsageAttributes(
        currentLLMSpan,
        message.usage.input_tokens,
        message.usage.output_tokens,
        message.usage.cache_creation_input_tokens,
        message.usage.cache_read_input_tokens
      );
    }

    // End the span
    currentLLMSpan.setStatus({ code: 1 });
    currentLLMSpan.end();

    // Move to previous (for tool matching)
    previousLLMSpan = currentLLMSpan;
    previousTurnTools = currentTurnTools;

    // Clear current
    currentLLMSpan = null;
    currentTurnContent = '';
    currentTurnTools = [];
    currentTurnId = null;
    currentTurnModel = null;
  }
}
```

**5. User Message with Tool Results**
```typescript
if (message.type === 'user' && message.message?.content) {
  const toolResults = Array.isArray(message.message.content)
    ? message.message.content.filter(c => c.type === 'tool_result')
    : [];

  for (const toolResult of toolResults) {
    // Find matching tool call
    let matchingTool = currentTurnTools.find(t => t.id === toolResult.tool_use_id);
    let parentLLMSpan = currentLLMSpan;

    // Check previous turn if not found in current
    if (!matchingTool && previousTurnTools.length > 0) {
      matchingTool = previousTurnTools.find(t => t.id === toolResult.tool_use_id);
      parentLLMSpan = previousLLMSpan;
    }

    if (matchingTool && parentLLMSpan) {
      // Create tool execution span as child of LLM span
      withActiveSpan(parentLLMSpan, () => {
        startSpan({
          name: `execute_tool ${matchingTool.name}`,
          op: 'gen_ai.execute_tool',
          // ... attributes
        }, (toolSpan) => {
          // Set input
          if (recordInputs && matchingTool.input) {
            toolSpan.setAttributes({
              'gen_ai.tool.input': JSON.stringify(matchingTool.input),
            });
          }

          // Set output
          if (recordOutputs && toolResult.content) {
            toolSpan.setAttributes({
              'gen_ai.tool.output': typeof toolResult.content === 'string'
                ? toolResult.content
                : JSON.stringify(toolResult.content),
            });
          }

          // Set error status
          if (toolResult.is_error) {
            toolSpan.setStatus({ code: 2, message: 'Tool execution error' });
          }
        });
      });
    }
  }
}
```

**6. Generator Completion**
```typescript
// After loop completes
if (recordOutputs && finalResult) {
  parentSpan.setAttributes({
    'gen_ai.response.text': finalResult,
  });
}

if (sessionId) {
  parentSpan.setAttributes({
    'gen_ai.response.id': sessionId,
  });
}

parentSpan.setStatus({ code: 1 });
```

#### Critical Edge Cases

**Edge Case 1: No Tool Calls Made**
```typescript
// Assistant responds without calling tools
{ type: 'assistant', message: { content: [{ type: 'text', text: 'Done!' }] } }
{ type: 'result', ... }

// Next turn starts immediately
{ type: 'assistant', message: { content: [{ type: 'text', text: 'Now...' }] } }
```

**Solution**: Close `previousLLMSpan` when new assistant message arrives:
```typescript
if (message.type === 'assistant' && previousLLMSpan) {
  previousLLMSpan.end();
  previousLLMSpan = null;
}
```

**Edge Case 2: Tool Results Arrive After Next Turn Starts**
```typescript
// Turn 1: Assistant calls tool
{ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'A', ... }] } }
{ type: 'result', ... }

// Turn 2: Assistant continues (tools haven't executed yet)
{ type: 'assistant', message: { content: [{ type: 'text', text: '...' }] } }

// NOW tools from turn 1 execute
{ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'A', ... }] } }
```

**Solution**: Keep `previousLLMSpan` reference and `previousTurnTools`:
```typescript
let matchingTool = currentTurnTools.find(t => t.id === toolResult.tool_use_id);
if (!matchingTool) {
  // Check previous turn
  matchingTool = previousTurnTools.find(t => t.id === toolResult.tool_use_id);
  // Create tool span as child of previousLLMSpan
}
```

**Edge Case 3: Multiple Tool Calls in One Turn**
```typescript
{ type: 'assistant', message: { content: [
  { type: 'tool_use', id: 'A', name: 'Read', ... },
  { type: 'tool_use', id: 'B', name: 'Glob', ... },
  { type: 'tool_use', id: 'C', name: 'Bash', ... },
] } }
{ type: 'result', ... }

{ type: 'user', message: { content: [
  { type: 'tool_result', tool_use_id: 'A', ... },
  { type: 'tool_result', tool_use_id: 'B', ... },
  { type: 'tool_result', tool_use_id: 'C', ... },
] } }
```

**Solution**: Accumulate all tool_use blocks in array:
```typescript
currentTurnTools.push(...tools);
```

Then create span for each tool_result:
```typescript
for (const toolResult of toolResults) {
  const matchingTool = currentTurnTools.find(t => t.id === toolResult.tool_use_id);
  // Create span...
}
```

### Input Messages Handling

#### The Challenge

The Claude Code SDK doesn't expose the full conversation history in a single place. We need to construct it for Sentry tracing.

**Option 1: From `conversation_history` (system message)**
```typescript
{
  type: 'system',
  subtype: 'init',
  conversation_history: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
    { role: 'user', content: 'How are you?' },
  ]
}
```

**Option 2: Pass explicitly via `inputMessages` parameter**
```typescript
// In user's API route
const inputMessages = [
  { role: 'system', content: systemPrompt },
  ...messages.map(convertToAnthropicFormat)
];

const agentStream = query({
  prompt: 'Continue',
  inputMessages: inputMessages, // Our custom parameter
  options: { ... },
});
```

#### Current Implementation

Uses **both approaches**:

1. **Capture from `conversation_history`** if available (SDK provides it)
2. **Use `inputMessages`** if explicitly passed (user provides it)

```typescript
// In instrumented generator
let inputMessagesCaptured = false;

for await (const message of originalQuery) {
  // Try to get from system message
  if (message.type === 'system' && message.conversation_history) {
    if (!inputMessagesCaptured && recordInputs) {
      span.setAttributes({
        'gen_ai.request.messages': JSON.stringify(message.conversation_history),
      });
      inputMessagesCaptured = true;
    }
  }
}

// Also check if user passed inputMessages explicitly
if (!inputMessagesCaptured && recordInputs && instrumentationOptions.inputMessages) {
  // Set on chat span instead of invoke_agent span
  chatSpan.setAttributes({
    'gen_ai.request.messages': JSON.stringify(instrumentationOptions.inputMessages),
  });
}
```

#### For Automatic Instrumentation

**Problem**: With auto-patching, we can't add a custom `inputMessages` parameter.

**Solution**: Reconstruct from SDK's internal state or conversation_history:

```typescript
// Option A: Use conversation_history from system message (preferred)
if (message.type === 'system' && message.conversation_history) {
  // This includes full history
  inputMessages = message.conversation_history;
}

// Option B: Build from prompt if it's an async iterable
if (prompt && Symbol.asyncIterator in Object(prompt)) {
  inputMessages = [];
  for await (const msg of prompt) {
    inputMessages.push(msg.message);
  }
}

// Option C: Just use the current prompt
inputMessages = [{ role: 'user', content: prompt }];
```

**Recommendation**: Use `conversation_history` from system message as it's provided by the SDK.

---

## Implementation Plan

### Phase 1: Code Restructuring (Week 1)

#### Task 1.1: Create Integration Package Structure

**Directory structure:**
```
@sentry/node/src/integrations/tracing/claude-code/
├── index.ts                 # Main export
├── instrumentation.ts       # OpenTelemetry instrumentation
├── utils.ts                 # Helper functions
├── types.ts                 # TypeScript types
└── constants.ts             # Constants (attributes, origins, etc.)
```

**Files to create:**

1. **constants.ts**
```typescript
export const PACKAGE_NAME = '@anthropic-ai/claude-agent-sdk';
export const SENTRY_ORIGIN = 'auto.ai.claude-code';

export const GEN_AI_ATTRIBUTES = {
  SYSTEM: 'gen_ai.system',
  OPERATION_NAME: 'gen_ai.operation.name',
  REQUEST_MODEL: 'gen_ai.request.model',
  REQUEST_MESSAGES: 'gen_ai.request.messages',
  RESPONSE_TEXT: 'gen_ai.response.text',
  RESPONSE_TOOL_CALLS: 'gen_ai.response.tool_calls',
  RESPONSE_ID: 'gen_ai.response.id',
  RESPONSE_MODEL: 'gen_ai.response.model',
  USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
  USAGE_TOTAL_TOKENS: 'gen_ai.usage.total_tokens',
  TOOL_NAME: 'gen_ai.tool.name',
  TOOL_INPUT: 'gen_ai.tool.input',
  TOOL_OUTPUT: 'gen_ai.tool.output',
  AGENT_NAME: 'gen_ai.agent.name',
} as const;

export const INTEGRATION_NAME = 'ClaudeCode';
```

2. **types.ts** (see "Target State" section)

3. **utils.ts** (see "Target State" section)

4. **instrumentation.ts** (see "Target State" section)

5. **index.ts** (see "Target State" section)

#### Task 1.2: Convert Current Implementation

**Steps:**

1. Copy `sentry-claude-code-integration.js` to `instrumentation.ts`
2. Convert to TypeScript with proper types
3. Refactor into class-based OpenTelemetry instrumentation
4. Extract helper functions to `utils.ts`
5. Extract constants to `constants.ts`
6. Add proper imports from `@sentry/core` and `@opentelemetry/instrumentation`

**Key changes:**

```typescript
// Before (standalone function)
export function instrumentClaudeCodeQuery(originalQueryFn, options = {}) {
  // ...
}

// After (instrumentation class method)
export class SentryClaudeCodeInstrumentation extends InstrumentationBase {
  private _patchQuery(originalQuery: Function) {
    // ...
  }
}
```

#### Task 1.3: Add Module Patching

**Implement `init()` method:**

```typescript
init() {
  const packageName = this._config.packageName || PACKAGE_NAME;

  return [
    new InstrumentationNodeModuleDefinition(
      packageName,
      ['*'], // All versions
      (moduleExports: any, moduleVersion?: string) => {
        this._diag.debug(`Patching ${packageName}@${moduleVersion}`);
        this._wrap(moduleExports, 'query', this._patchQuery.bind(this));
        return moduleExports;
      },
      (moduleExports: any, moduleVersion?: string) => {
        this._diag.debug(`Unpatching ${packageName}@${moduleVersion}`);
        this._unwrap(moduleExports, 'query');
        return moduleExports;
      }
    ),
  ];
}
```

**Test module patching:**

```typescript
// test-module-patching.ts
import * as Sentry from '@sentry/node';
import { query } from '@anthropic-ai/claude-agent-sdk';

// Before init - query is original
console.log('Before:', query.name);

// Initialize with integration
Sentry.init({
  integrations: [Sentry.claudeCodeIntegration()],
});

// After init - query is patched
console.log('After:', query.name); // Should be 'patchedQuery' or similar

// Test that it works
for await (const msg of query({ prompt: 'test' })) {
  console.log(msg.type);
}
```

#### Task 1.4: Add TypeScript Definitions

**Create type definitions:**

1. Copy types from current implementation
2. Add JSDoc comments for each interface
3. Export from integration module
4. Add to `@sentry/node` types

**Example:**

```typescript
/**
 * Configuration options for Claude Code integration.
 */
export interface ClaudeCodeIntegrationOptions {
  /**
   * Whether to capture prompts and user messages.
   * Defaults to Sentry client's `sendDefaultPii` setting.
   *
   * @default undefined (uses sendDefaultPii)
   */
  recordInputs?: boolean;

  /**
   * Whether to capture LLM responses, tool calls, and tool outputs.
   * Defaults to Sentry client's `sendDefaultPii` setting.
   *
   * @default undefined (uses sendDefaultPii)
   */
  recordOutputs?: boolean;

  /**
   * Package name to instrument. Use this if you have multiple claude-code
   * packages or custom imports.
   *
   * @default '@anthropic-ai/claude-agent-sdk'
   */
  packageName?: string;
}

/**
 * Message types from Claude Code SDK.
 */
export type SDKMessage =
  | SystemMessage
  | AssistantMessage
  | UserMessage
  | ResultMessage
  | ErrorMessage;

// ... etc
```

### Phase 2: Testing (Week 2)

#### Task 2.1: Unit Tests

Create test file structure:
```
@sentry/node/test/integrations/tracing/claude-code/
├── instrumentation.test.ts
├── utils.test.ts
├── integration.test.ts
└── fixtures/
    ├── messages.ts
    └── spans.ts
```

**Test categories:**

1. **Module Patching Tests**
```typescript
describe('Claude Code Module Patching', () => {
  it('should patch query function on init', () => {
    // Test that query is wrapped
  });

  it('should unpatch query function on disable', () => {
    // Test that query is restored
  });

  it('should preserve original query functionality', () => {
    // Test that patched query works the same
  });
});
```

2. **Span Creation Tests**
```typescript
describe('Claude Code Span Creation', () => {
  it('should create invoke_agent span for query', async () => {
    // Test parent span is created
  });

  it('should create chat span for LLM turns', async () => {
    // Test child spans are created
  });

  it('should create execute_tool spans for tool calls', async () => {
    // Test grandchild spans are created
  });

  it('should maintain proper parent-child relationships', async () => {
    // Test span hierarchy
  });
});
```

3. **Attribute Tests**
```typescript
describe('Claude Code Span Attributes', () => {
  it('should set correct attributes on invoke_agent span', async () => {
    // Test parent span attributes
  });

  it('should set request messages when recordInputs=true', async () => {
    // Test input capture
  });

  it('should set response text when recordOutputs=true', async () => {
    // Test output capture
  });

  it('should set tool calls array', async () => {
    // Test tool call capture
  });

  it('should set token usage attributes', async () => {
    // Test token counting
  });

  it('should respect sendDefaultPii setting', async () => {
    // Test PII controls
  });
});
```

4. **State Management Tests**
```typescript
describe('Claude Code State Management', () => {
  it('should accumulate assistant messages across multiple chunks', async () => {
    // Test content accumulation
  });

  it('should match tool results to tool calls', async () => {
    // Test tool matching
  });

  it('should handle delayed tool results', async () => {
    // Test previousLLMSpan logic
  });

  it('should handle multiple tool calls in one turn', async () => {
    // Test multiple tools
  });
});
```

5. **Error Handling Tests**
```typescript
describe('Claude Code Error Handling', () => {
  it('should set error status on span when query fails', async () => {
    // Test error spans
  });

  it('should set error status on tool span when tool fails', async () => {
    // Test tool errors
  });

  it('should still end span on error', async () => {
    // Test cleanup
  });
});
```

6. **Query Interface Tests**
```typescript
describe('Claude Code Query Interface', () => {
  it('should preserve interrupt() method', async () => {
    // Test interrupt is callable
  });

  it('should preserve setPermissionMode() method', async () => {
    // Test setPermissionMode is callable
  });

  it('should bind methods to original instance', async () => {
    // Test method binding
  });
});
```

**Test fixtures:**

```typescript
// fixtures/messages.ts
export const SYSTEM_MESSAGE = {
  type: 'system',
  subtype: 'init',
  session_id: 'test-session-123',
  conversation_history: [
    { role: 'user', content: 'Hello' },
  ],
};

export const ASSISTANT_MESSAGE_TEXT = {
  type: 'assistant',
  message: {
    id: 'msg_123',
    model: 'claude-sonnet-4-5',
    content: [
      { type: 'text', text: 'Hello! How can I help?' },
    ],
  },
};

export const ASSISTANT_MESSAGE_TOOLS = {
  type: 'assistant',
  message: {
    id: 'msg_124',
    model: 'claude-sonnet-4-5',
    content: [
      {
        type: 'tool_use',
        id: 'tool_abc',
        name: 'Read',
        input: { file_path: '/test.txt' }
      },
    ],
  },
};

export const USER_MESSAGE_TOOL_RESULT = {
  type: 'user',
  message: {
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'tool_abc',
        content: 'File contents here',
      },
    ],
  },
};

export const RESULT_MESSAGE = {
  type: 'result',
  result: 'Task completed successfully',
  usage: {
    input_tokens: 100,
    output_tokens: 50,
    cache_creation_input_tokens: 200,
    cache_read_input_tokens: 1000,
  },
};

export const ERROR_MESSAGE = {
  type: 'error',
  error: new Error('Something went wrong'),
};
```

#### Task 2.2: Integration Tests

Create end-to-end test:

```typescript
// integration.test.ts
import * as Sentry from '@sentry/node';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { getTestClient, getTestSpans } from '../../../test-helpers';

describe('Claude Code Integration E2E', () => {
  beforeEach(() => {
    // Setup test client
    Sentry.init({
      dsn: 'test-dsn',
      sendDefaultPii: true,
      tracesSampleRate: 1.0,
      integrations: [
        Sentry.claudeCodeIntegration({
          recordInputs: true,
          recordOutputs: true,
        }),
      ],
    });
  });

  afterEach(() => {
    // Cleanup
    Sentry.getCurrentScope().clear();
  });

  it('should capture full conversation flow', async () => {
    // Execute query
    const messages = [];
    for await (const msg of query({
      prompt: 'List files in /tmp',
      options: { model: 'sonnet' },
    })) {
      messages.push(msg);
    }

    // Get captured spans
    const spans = getTestSpans();

    // Verify span hierarchy
    expect(spans).toHaveLength(3); // invoke_agent + chat + execute_tool

    const [parentSpan, chatSpan, toolSpan] = spans;

    // Verify parent span
    expect(parentSpan.op).toBe('gen_ai.invoke_agent');
    expect(parentSpan.data['gen_ai.system']).toBe('claude-code');

    // Verify chat span
    expect(chatSpan.op).toBe('gen_ai.chat');
    expect(chatSpan.parent_span_id).toBe(parentSpan.span_id);

    // Verify tool span
    expect(toolSpan.op).toBe('gen_ai.execute_tool');
    expect(toolSpan.parent_span_id).toBe(chatSpan.span_id);
  });
});
```

#### Task 2.3: Real-World Testing

**Create test application:**

```typescript
// examples/claude-code/basic.ts
import * as Sentry from '@sentry/node';
import { query } from '@anthropic-ai/claude-agent-sdk';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  sendDefaultPii: true,
  tracesSampleRate: 1.0,
  integrations: [
    Sentry.claudeCodeIntegration(),
  ],
});

async function main() {
  console.log('Testing Claude Code with Sentry...');

  const agentStream = query({
    prompt: 'List all JavaScript files in the current directory',
    options: {
      model: 'claude-sonnet-4-5',
      maxTurns: 5,
    },
  });

  for await (const message of agentStream) {
    console.log(`[${message.type}]`, message);
  }

  console.log('Done! Check Sentry for spans.');
}

main();
```

**Test scenarios:**

1. Simple query (no tools)
2. Query with tool calls
3. Multi-turn conversation
4. Error cases
5. Interrupt functionality
6. Permission mode changes

### Phase 3: Documentation (Week 3)

#### Task 3.1: API Documentation

**Create documentation file:**

```markdown
<!-- docs/platforms/javascript/guides/node/integrations/claude-code.mdx -->

# Claude Code Integration

Sentry's Claude Code integration automatically instruments the Claude Code SDK
to capture AI monitoring data including prompts, responses, tool calls, and token usage.

## Installation

The integration is included in `@sentry/node` version X.X.X and above.

```bash
npm install @sentry/node
```

## Setup

Add `claudeCodeIntegration()` to your Sentry initialization:

```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: '__DSN__',
  sendDefaultPii: true, // Required to capture prompts/responses by default
  integrations: [
    Sentry.claudeCodeIntegration({
      recordInputs: true,  // Capture prompts
      recordOutputs: true, // Capture responses
    }),
  ],
});
```

Now use the Claude Code SDK normally - it's automatically instrumented!

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

for await (const msg of query({ prompt: 'Hello!' })) {
  console.log(msg);
}
```

## Configuration

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `recordInputs` | `boolean` | `sendDefaultPii` | Whether to capture prompts and user messages |
| `recordOutputs` | `boolean` | `sendDefaultPii` | Whether to capture responses, tool calls, and outputs |
| `packageName` | `string` | `'@anthropic-ai/claude-agent-sdk'` | Package name to instrument |

### PII Control

The integration respects your Sentry client's `sendDefaultPii` setting by default.

**Capture everything:**
```typescript
Sentry.init({
  sendDefaultPii: true,
  integrations: [Sentry.claudeCodeIntegration()],
});
```

**Capture only metadata:**
```typescript
Sentry.init({
  sendDefaultPii: false,
  integrations: [
    Sentry.claudeCodeIntegration({
      recordInputs: false,
      recordOutputs: false,
    }),
  ],
});
```

## What Gets Captured

### Span Hierarchy

```
invoke_agent claude-code
├─ chat claude-sonnet-4-5
│  ├─ execute_tool Read
│  └─ execute_tool Glob
└─ chat claude-sonnet-4-5
   └─ execute_tool Bash
```

### Span Attributes

**invoke_agent span:**
- `gen_ai.system`: "claude-code"
- `gen_ai.operation.name`: "invoke_agent"
- `gen_ai.request.model`: Model name
- `gen_ai.agent.name`: "claude-code"
- `gen_ai.response.id`: Session ID
- `gen_ai.response.text`: Final result

**chat span:**
- `gen_ai.system`: "claude-code"
- `gen_ai.operation.name`: "chat"
- `gen_ai.request.model`: Model name
- `gen_ai.request.messages`: Input messages (when `recordInputs=true`)
- `gen_ai.response.text`: Assistant's text response (when `recordOutputs=true`)
- `gen_ai.response.tool_calls`: Array of tool calls (when `recordOutputs=true`)
- `gen_ai.response.id`: Message ID
- `gen_ai.response.model`: Actual model used
- `gen_ai.usage.input_tokens`: Input token count
- `gen_ai.usage.output_tokens`: Output token count
- `gen_ai.usage.total_tokens`: Total tokens (includes cache tokens)

**execute_tool span:**
- `gen_ai.system`: "claude-code"
- `gen_ai.operation.name`: "execute_tool"
- `gen_ai.tool.name`: Tool name (e.g., "Read", "Glob", "Bash")
- `gen_ai.tool.input`: Tool input parameters (when `recordInputs=true`)
- `gen_ai.tool.output`: Tool execution result (when `recordOutputs=true`)

## Examples

### Basic Usage

```typescript
import * as Sentry from '@sentry/node';
import { query } from '@anthropic-ai/claude-agent-sdk';

Sentry.init({
  dsn: '__DSN__',
  integrations: [Sentry.claudeCodeIntegration()],
});

for await (const msg of query({
  prompt: 'List files',
  options: { model: 'sonnet' },
})) {
  console.log(msg);
}
```

### With Transaction

```typescript
const transaction = Sentry.startTransaction({
  op: 'ai.pipeline',
  name: 'Generate Code',
});

Sentry.getCurrentScope().setSpan(transaction);

for await (const msg of query({ prompt: 'Write a function' })) {
  // Messages are captured as child spans
  console.log(msg);
}

transaction.finish();
```

### Error Handling

```typescript
try {
  for await (const msg of query({ prompt: 'Hello' })) {
    console.log(msg);
  }
} catch (error) {
  // Error is automatically captured with span
  Sentry.captureException(error);
}
```

## Troubleshooting

### Spans not appearing

Make sure:
- `tracesSampleRate` is greater than 0
- Integration is added to `integrations` array
- You're using `@anthropic-ai/claude-agent-sdk` package

### Prompts/responses not captured

Make sure:
- `sendDefaultPii: true` is set, OR
- `recordInputs: true` and `recordOutputs: true` are explicitly set in integration options

### Methods not working

The integration preserves the Query interface methods (`interrupt()`, `setPermissionMode()`).
If they're not working, ensure you're using a version of the SDK that supports them.

## Further Reading

- [OpenTelemetry Semantic Conventions for GenAI](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [Sentry AI Monitoring](https://docs.sentry.io/product/ai-monitoring/)
```

#### Task 3.2: Migration Guide

**For users with manual wrapping:**

```markdown
# Migrating from Manual Instrumentation

If you're currently using manual instrumentation:

## Before

```typescript
import { query as originalQuery } from '@anthropic-ai/claude-agent-sdk';
import { instrumentClaudeCodeQuery } from './sentry-claude-code-integration';

const query = instrumentClaudeCodeQuery(originalQuery, {
  recordInputs: true,
  recordOutputs: true,
});

for await (const msg of query({ prompt: 'Hello' })) {
  console.log(msg);
}
```

## After

```typescript
import * as Sentry from '@sentry/node';
import { query } from '@anthropic-ai/claude-agent-sdk';

Sentry.init({
  integrations: [
    Sentry.claudeCodeIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
  ],
});

// No wrapping needed!
for await (const msg of query({ prompt: 'Hello' })) {
  console.log(msg);
}
```

## Changes

1. Remove manual wrapping code
2. Add integration to Sentry.init()
3. Import query directly from SDK
4. Everything else stays the same!
```

#### Task 3.3: Code Comments

Add comprehensive JSDoc comments:

```typescript
/**
 * Claude Code integration for Sentry.
 *
 * Automatically instruments the Claude Code SDK (`@anthropic-ai/claude-agent-sdk`)
 * to capture AI monitoring data.
 *
 * ## What it captures:
 * - User prompts and assistant responses
 * - Tool calls with inputs and outputs
 * - Token usage including cache metrics
 * - Multi-turn conversations
 * - Session tracking
 *
 * ## Usage:
 *
 * ```typescript
 * import * as Sentry from '@sentry/node';
 *
 * Sentry.init({
 *   dsn: '__DSN__',
 *   sendDefaultPii: true,
 *   integrations: [
 *     Sentry.claudeCodeIntegration({
 *       recordInputs: true,
 *       recordOutputs: true,
 *     }),
 *   ],
 * });
 *
 * // Now use Claude Code SDK normally
 * import { query } from '@anthropic-ai/claude-agent-sdk';
 *
 * for await (const msg of query({ prompt: 'Hello!' })) {
 *   console.log(msg);
 * }
 * ```
 *
 * @param options Integration options
 * @returns Integration instance
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/node/integrations/claude-code/
 */
export function claudeCodeIntegration(
  options: ClaudeCodeIntegrationOptions = {}
): Integration {
  // ...
}
```

### Phase 4: PR Preparation (Week 4)

#### Task 4.1: Create Example Application

**Create complete example:**

```
examples/claude-code/
├── package.json
├── README.md
├── basic.ts                 # Simple usage
├── with-tools.ts            # With tool calls
├── multi-turn.ts            # Multi-turn conversation
├── error-handling.ts        # Error cases
└── custom-transaction.ts    # Within custom transaction
```

**Example: `basic.ts`**

```typescript
import * as Sentry from '@sentry/node';
import { query } from '@anthropic-ai/claude-agent-sdk';

// Initialize Sentry with Claude Code integration
Sentry.init({
  dsn: process.env.SENTRY_DSN || 'your-dsn-here',
  sendDefaultPii: true,
  tracesSampleRate: 1.0,
  integrations: [
    Sentry.claudeCodeIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
  ],
});

async function main() {
  console.log('🚀 Testing Claude Code with Sentry integration...\n');

  try {
    const agentStream = query({
      prompt: 'What is 2 + 2?',
      options: {
        model: 'claude-sonnet-4-5',
        maxTurns: 3,
      },
    });

    console.log('📬 Messages:');
    for await (const message of agentStream) {
      console.log(`  [${message.type}]`, message);
    }

    console.log('\n✅ Done! Check Sentry for spans.');
    console.log(`   View at: https://sentry.io/...`);
  } catch (error) {
    console.error('❌ Error:', error);
    Sentry.captureException(error);
  }
}

main();
```

#### Task 4.2: Add to CHANGELOG

```markdown
## X.X.X

### Features

- **node**: Add Claude Code integration for AI monitoring ([#XXXX](https://github.com/getsentry/sentry-javascript/pull/XXXX))

  Automatically instrument the Claude Code SDK to capture prompts, responses,
  tool calls, and token usage.

  ```typescript
  import * as Sentry from '@sentry/node';

  Sentry.init({
    integrations: [Sentry.claudeCodeIntegration()],
  });
  ```

  See [documentation](https://docs.sentry.io/platforms/javascript/guides/node/integrations/claude-code/)
  for more details.
```

#### Task 4.3: Update Package Dependencies

Add OpenTelemetry instrumentation dependency:

```json
// @sentry/node/package.json
{
  "dependencies": {
    "@opentelemetry/instrumentation": "^0.55.0"
  },
  "peerDependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.x.x"
  },
  "peerDependenciesMeta": {
    "@anthropic-ai/claude-agent-sdk": {
      "optional": true
    }
  }
}
```

#### Task 4.4: Write PR Description

**Template:**

```markdown
# Add Claude Code Integration for AI Monitoring

## Summary

This PR adds a new integration for the Claude Code SDK (`@anthropic-ai/claude-agent-sdk`)
that automatically instruments AI queries to capture prompts, responses, tool calls,
and token usage in Sentry.

## Motivation

Claude Code SDK is a new agent framework from Anthropic that provides tool-enabled
AI interactions. This integration allows developers to monitor their Claude Code
usage with the same level of detail as other AI providers.

## Implementation

Follows the same pattern as `anthropicAIIntegration`:

1. **Module Patching**: Uses OpenTelemetry instrumentation to patch `query()` function
2. **AsyncGenerator Wrapping**: Wraps the SDK's async generator to intercept messages
3. **Span Creation**: Creates proper parent-child span relationships
4. **State Management**: Accumulates message data across streaming chunks
5. **Method Preservation**: Preserves Query interface methods (`interrupt`, `setPermissionMode`)

## Span Hierarchy

```
invoke_agent claude-code
├─ chat claude-sonnet-4-5
│  ├─ execute_tool Read
│  └─ execute_tool Glob
└─ chat claude-sonnet-4-5
   └─ execute_tool Bash
```

## Usage

```typescript
import * as Sentry from '@sentry/node';
import { query } from '@anthropic-ai/claude-agent-sdk';

Sentry.init({
  dsn: '__DSN__',
  sendDefaultPii: true,
  integrations: [Sentry.claudeCodeIntegration()],
});

// Automatically instrumented!
for await (const msg of query({ prompt: 'Hello' })) {
  console.log(msg);
}
```

## Testing

- [x] Unit tests for instrumentation
- [x] Unit tests for span creation
- [x] Unit tests for attribute setting
- [x] Integration tests with real SDK
- [x] Example applications
- [x] Manual testing in production-like environment

## Documentation

- [x] API documentation
- [x] Usage examples
- [x] Migration guide (from manual wrapping)
- [x] Troubleshooting guide
- [x] JSDoc comments

## Checklist

- [x] Tests pass locally
- [x] TypeScript types are correct
- [x] Documentation is complete
- [x] Example code works
- [x] CHANGELOG updated
- [x] No breaking changes

## Related

- Follows pattern from #XXXX (anthropicAIIntegration)
- Implements OpenTelemetry semantic conventions for GenAI
- Addresses feature request #YYYY
```

---

## Sentry PR Submission Guide

### Prerequisites

1. **Fork Sentry JavaScript Repository**
```bash
git clone https://github.com/YOUR_USERNAME/sentry-javascript.git
cd sentry-javascript
git remote add upstream https://github.com/getsentry/sentry-javascript.git
```

2. **Install Dependencies**
```bash
yarn install
```

3. **Create Feature Branch**
```bash
git checkout -b feat/claude-code-integration
```

### File Structure in Sentry Repo

Create these files:

```
packages/node/src/integrations/tracing/claude-code/
├── index.ts
├── instrumentation.ts
├── utils.ts
├── types.ts
└── constants.ts

packages/node/test/integrations/tracing/claude-code/
├── instrumentation.test.ts
├── utils.test.ts
├── integration.test.ts
└── fixtures/
    ├── messages.ts
    └── spans.ts

examples/claude-code/
├── package.json
├── README.md
└── *.ts (example files)

docs/platforms/javascript/guides/node/integrations/
└── claude-code.mdx
```

### Coding Standards

**Follow Sentry's conventions:**

1. **Imports**: Use absolute imports from `@sentry/core`
2. **Exports**: Use named exports, no default exports
3. **Types**: Use TypeScript strict mode
4. **Comments**: Add JSDoc for all public APIs
5. **Tests**: Aim for >90% coverage
6. **Formatting**: Run `yarn format` before committing
7. **Linting**: Run `yarn lint` before committing

### Running Tests

```bash
# Unit tests
yarn test packages/node/test/integrations/tracing/claude-code

# All node tests
yarn test packages/node

# Specific test file
yarn test packages/node/test/integrations/tracing/claude-code/instrumentation.test.ts

# With coverage
yarn test:coverage
```

### Building

```bash
# Build all packages
yarn build

# Build only @sentry/node
yarn build:tarball packages/node

# Watch mode for development
yarn build:watch packages/node
```

### Commit Message Format

Sentry uses conventional commits:

```
feat(node): Add Claude Code integration for AI monitoring

- Automatically instrument @anthropic-ai/claude-agent-sdk
- Capture prompts, responses, tool calls, and token usage
- Follow OpenTelemetry semantic conventions
- Preserve Query interface methods

Closes #ISSUE_NUMBER
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Test changes
- `refactor`: Code refactoring
- `chore`: Build/tooling changes

### PR Submission Steps

1. **Push to your fork**
```bash
git add .
git commit -m "feat(node): Add Claude Code integration for AI monitoring"
git push origin feat/claude-code-integration
```

2. **Open PR on GitHub**
- Go to https://github.com/getsentry/sentry-javascript
- Click "New Pull Request"
- Select your branch
- Fill in PR template

3. **PR Template Fields**

```markdown
## Description
[Describe what this PR does]

## Type of Change
- [x] New feature
- [ ] Bug fix
- [ ] Breaking change
- [ ] Documentation update

## Testing
[Describe how you tested this]

## Checklist
- [x] Tests pass locally
- [x] TypeScript compiles
- [x] Documentation added
- [x] CHANGELOG updated
```

4. **Respond to Reviews**
- Address all feedback
- Push updates to same branch
- Request re-review when ready

### Review Process

**What to expect:**

1. **Automated Checks** (~5 minutes)
   - Tests must pass
   - Linting must pass
   - TypeScript must compile
   - Coverage must be adequate

2. **Initial Review** (~1-3 days)
   - Maintainer reviews code
   - Provides feedback
   - May request changes

3. **Follow-up Reviews** (~1-2 days per iteration)
   - Address feedback
   - Push updates
   - Repeat until approved

4. **Final Approval** (~1-2 days)
   - Maintainer approves PR
   - May merge immediately or queue for next release

**Timeline:** Typically 1-4 weeks from submission to merge

### Common Review Feedback

**Be prepared for:**

1. **Code Style**: Follow existing patterns exactly
2. **Test Coverage**: Aim for >90%
3. **Documentation**: Must be comprehensive
4. **Performance**: No unnecessary overhead
5. **Compatibility**: Must work with all Node.js versions
6. **Edge Cases**: Handle all error scenarios

### After Merge

1. **Release Schedule**: Usually included in next minor version
2. **Announcement**: Sentry team handles
3. **Documentation**: Published to docs.sentry.io
4. **Credit**: Listed in CHANGELOG and release notes

---

## Timeline & Milestones

### Phase 1: Code Restructuring (Week 1)
**Goal**: Transform manual wrapping into automatic instrumentation

| Day | Tasks | Deliverables |
|-----|-------|--------------|
| 1-2 | Create package structure, convert to TypeScript | Files in correct structure |
| 3-4 | Implement module patching with OpenTelemetry | Working `init()` method |
| 5 | Add TypeScript definitions | Complete types |
| 6-7 | Test module patching, refine implementation | Patching works correctly |

**Milestone 1**: ✅ Module patching functional, code compiles

### Phase 2: Testing (Week 2)
**Goal**: Comprehensive test coverage

| Day | Tasks | Deliverables |
|-----|-------|--------------|
| 1-2 | Write unit tests for instrumentation | >90% coverage |
| 3-4 | Write integration tests | E2E tests passing |
| 5-6 | Create test fixtures and helpers | Reusable test utilities |
| 7 | Real-world testing with actual SDK | Confidence in production readiness |

**Milestone 2**: ✅ All tests passing, >90% coverage

### Phase 3: Documentation (Week 3)
**Goal**: Production-ready documentation

| Day | Tasks | Deliverables |
|-----|-------|--------------|
| 1-2 | Write API documentation | Complete MDX file |
| 3 | Create usage examples | 5+ example files |
| 4 | Write migration guide | Clear upgrade path |
| 5 | Add comprehensive JSDoc comments | All public APIs documented |
| 6-7 | Review and polish documentation | Publication-ready |

**Milestone 3**: ✅ Documentation complete and reviewed

### Phase 4: PR Preparation (Week 4)
**Goal**: Ready for Sentry team review

| Day | Tasks | Deliverables |
|-----|-------|--------------|
| 1-2 | Create example applications | Working examples |
| 3 | Update CHANGELOG, package.json | Metadata complete |
| 4-5 | Write comprehensive PR description | PR ready to submit |
| 6 | Final review, test everything | All checks passing |
| 7 | Submit PR | PR open on GitHub |

**Milestone 4**: ✅ PR submitted to getsentry/sentry-javascript

### Phase 5: Review & Iteration (Weeks 5-8)
**Goal**: Address feedback, get merged

| Week | Tasks | Deliverables |
|------|-------|--------------|
| 5 | Wait for initial review | Feedback received |
| 6-7 | Address feedback, push updates | Changes implemented |
| 8 | Final approval | PR merged! |

**Milestone 5**: ✅ PR merged into main branch

### Phase 6: Release (Weeks 9-10)
**Goal**: Available in official Sentry release

| Week | Tasks | Deliverables |
|------|-------|--------------|
| 9 | Wait for release schedule | Included in release candidate |
| 10 | Release published | Available in npm |

**Milestone 6**: ✅ Available in `@sentry/node`

---

## Risk Assessment

### High-Risk Items

#### Risk 1: Module Patching Compatibility

**Problem**: OpenTelemetry's module patching may not work with all module systems (ESM vs CommonJS).

**Mitigation**:
- Test with both `require()` and `import` statements
- Add detection for module type
- Provide fallback to manual wrapping if auto-patching fails
- Document known limitations

**Fallback**:
```typescript
// If auto-patching fails, provide manual option
import { instrumentClaudeCodeQuery } from '@sentry/node/utils';
import { query as originalQuery } from '@anthropic-ai/claude-agent-sdk';

const query = instrumentClaudeCodeQuery(originalQuery);
```

#### Risk 2: SDK Changes Breaking Integration

**Problem**: Claude Code SDK is new and may have breaking changes.

**Mitigation**:
- Pin to specific SDK version range in tests
- Add version detection logic
- Monitor SDK releases
- Create abstraction layer for SDK interactions

**Monitoring**:
```typescript
// Add version checking
const SDK_VERSION = require('@anthropic-ai/claude-agent-sdk/package.json').version;
if (!semver.satisfies(SDK_VERSION, '^0.x.x')) {
  logger.warn('Untested SDK version detected');
}
```

#### Risk 3: Performance Overhead

**Problem**: Wrapping async generators may add latency.

**Mitigation**:
- Benchmark before/after instrumentation
- Minimize work done in hot path
- Use efficient data structures
- Profile with realistic workloads

**Benchmarking**:
```typescript
// Measure overhead
const start = performance.now();
for await (const msg of query({ prompt: 'test' })) {
  // Process
}
const end = performance.now();
console.log(`Time: ${end - start}ms`);
```

**Target**: <5% overhead

### Medium-Risk Items

#### Risk 4: Incomplete Message Capture

**Problem**: Some messages may be missed if SDK behavior changes.

**Mitigation**:
- Add defensive programming (check for undefined)
- Log warnings for unexpected message types
- Version tests to ensure compatibility
- Monitor production for anomalies

#### Risk 5: Memory Leaks from State Tracking

**Problem**: Long-running conversations may accumulate state.

**Mitigation**:
- Clear state after each turn
- Limit state size (max N tools tracked)
- Add memory profiling tests
- Document memory characteristics

#### Risk 6: Sentry Team May Request Changes

**Problem**: PR may not meet Sentry's standards first time.

**Mitigation**:
- Study existing integrations carefully
- Match code style exactly
- Over-document everything
- Be responsive to feedback
- Allow extra time for iterations

### Low-Risk Items

#### Risk 7: Documentation Out of Date

**Problem**: Docs may become stale as SDK evolves.

**Mitigation**: Include SDK version in docs, add "last updated" dates.

#### Risk 8: Type Definitions Incomplete

**Problem**: TypeScript types may not cover all cases.

**Mitigation**: Use strict mode, add comprehensive tests.

---

## Success Criteria

### Must Have (Required for Merge)

- [ ] **Automatic instrumentation works** without manual wrapping
- [ ] **All tests pass** with >90% coverage
- [ ] **TypeScript compiles** without errors
- [ ] **Documentation complete** with examples
- [ ] **No breaking changes** to existing code
- [ ] **Performance overhead** <5%
- [ ] **Follows Sentry patterns** exactly (anthropicAIIntegration as reference)
- [ ] **OpenTelemetry compliant** semantic conventions
- [ ] **Method preservation** works (interrupt, setPermissionMode)
- [ ] **Multi-turn conversations** captured correctly
- [ ] **Tool calls tracked** with proper parent-child relationships
- [ ] **Token usage includes** cache tokens in total

### Should Have (Nice to Have)

- [ ] **Example applications** for common use cases
- [ ] **Migration guide** from manual wrapping
- [ ] **Troubleshooting guide** for common issues
- [ ] **Benchmark results** showing overhead
- [ ] **Integration with** Sentry AI Monitoring dashboard
- [ ] **Support for** streaming input mode (if SDK adds it)

### Could Have (Future Enhancements)

- [ ] **Custom span attributes** via options
- [ ] **Sampling** based on token count
- [ ] **Cost tracking** integration
- [ ] **Prompt templates** in span names
- [ ] **Support for** other Claude Code SDK features

---

## Appendix

### A. Reference Implementations

**Sentry Anthropic AI Integration:**
- Location: `@sentry/node/src/integrations/tracing/anthropic-ai/`
- Pattern: Direct SDK wrapping with manual span creation
- Worth studying: `instrumentation.ts` for patching pattern

**Sentry Vercel AI Integration:**
- Location: `@sentry/node/src/integrations/tracing/vercel-ai/`
- Pattern: OpenTelemetry post-processing (different from ours)
- Worth studying: Integration structure and exports

**OpenTelemetry Instrumentation Examples:**
- `@opentelemetry/instrumentation-http`
- `@opentelemetry/instrumentation-express`
- Worth studying: Module patching patterns

### B. Key Files in Current Implementation

**Production Code:**
- `sentry-claude-code-integration.js` (462 lines) - Main integration
- `src/app/api/claude-agent/route.ts` - Example usage
- `sentry.server.config.ts` - Sentry configuration

**Tests:**
- `test-claude-code-wrap.js` - Basic wrapping
- `test-claude-code-tools.js` - Tool call capture
- `test-claude-code-interrupt.js` - Method preservation
- `test-sentry-integration.js` - Full integration
- `test-span-attributes.js` - Attribute verification

**Documentation:**
- `SENTRY_CLAUDE_CODE_INTEGRATION.md` (392 lines) - Technical docs
- `QUICKSTART.md` (189 lines) - Testing guide
- `INTEGRATION_SUMMARY.md` (300 lines) - Project summary
- `README_INTEGRATION.md` (187 lines) - Overview

### C. OpenTelemetry Semantic Conventions

**Gen AI Attributes (from spec v1.36.0):**

```typescript
// System identification
'gen_ai.system' = 'claude-code'

// Operation types
'gen_ai.operation.name' = 'invoke_agent' | 'chat' | 'execute_tool'

// Request attributes
'gen_ai.request.model' = 'claude-sonnet-4-5'
'gen_ai.request.messages' = '[{...}]'  // JSON array

// Response attributes
'gen_ai.response.text' = '...'
'gen_ai.response.tool_calls' = '[{...}]'  // JSON array
'gen_ai.response.id' = 'session-uuid'
'gen_ai.response.model' = 'claude-sonnet-4-5'

// Usage attributes
'gen_ai.usage.input_tokens' = 100
'gen_ai.usage.output_tokens' = 50
'gen_ai.usage.total_tokens' = 150

// Tool attributes
'gen_ai.tool.name' = 'Read'
'gen_ai.tool.input' = '{...}'  // JSON object
'gen_ai.tool.output' = '...'

// Agent attributes (custom)
'gen_ai.agent.name' = 'claude-code'

// Sentry metadata
'sentry.origin' = 'auto.ai.claude-code'
```

**Reference**: https://opentelemetry.io/docs/specs/semconv/gen-ai/

### D. Contact & Resources

**Sentry Team:**
- GitHub: https://github.com/getsentry/sentry-javascript
- Discord: https://discord.gg/sentry
- Email: support@sentry.io

**Claude Code SDK:**
- Package: https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk
- Docs: https://github.com/anthropics/anthropic-sdk-typescript

**OpenTelemetry:**
- Instrumentation: https://opentelemetry.io/docs/instrumentation/js/
- Semantic Conventions: https://opentelemetry.io/docs/specs/semconv/

**This Document:**
- Created: September 30, 2025
- Author: Based on working integration in sentryvibe project
- Version: 1.0
- Status: Planning Phase

---

## Quick Reference Commands

```bash
# Testing
yarn test packages/node/test/integrations/tracing/claude-code

# Building
yarn build:watch packages/node

# Formatting
yarn format

# Linting
yarn lint

# Type checking
yarn tsc

# Coverage
yarn test:coverage

# Create PR branch
git checkout -b feat/claude-code-integration

# Commit
git commit -m "feat(node): Add Claude Code integration"

# Push
git push origin feat/claude-code-integration
```

---

**END OF DOCUMENT**

When you return to this project, read this document from top to bottom. It contains everything you need to continue from where we left off.
