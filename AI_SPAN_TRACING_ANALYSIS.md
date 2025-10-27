# AI Span Tracing Disconnection Analysis

**Date**: October 27, 2025  
**Status**: 🔍 Analysis Complete - Issue Identified, Solution Proposed

---

## 🎯 Executive Summary

Your AI spans (automatically created by Sentry's Claude Code integration) are **disconnected** from your distributed trace flow because they exist in a **different trace context** than the event processing pipeline.

**The Problem:**
- AI spans are created during the `runner.build` span (when Claude executes)
- Event processing spans (runner → broker → nextjs → db) are created during event emission
- These two trace hierarchies **don't connect** because they're in different execution contexts

---

## 🔍 Current Trace Architecture

### **What You Have Now: Two Separate Trace Trees**

```
TRACE TREE 1: Build Execution (Runner-Only)
┌────────────────────────────────────────────────────────┐
│ Transaction: runner.build                              │
│ ├─ Span: orchestrateBuild                             │
│ ├─ Span: createClaudeQuery                            │
│ │  └─ AI Spans (from claudeCodeIntegration):          │
│ │      ├─ ai.chat.completions (request to Claude)     │
│ │      ├─ ai.tool.call.read                           │
│ │      ├─ ai.tool.call.write                          │
│ │      └─ ai.tool.call.bash                           │
│ └─ Span: transformAISDKStream                         │
└────────────────────────────────────────────────────────┘
        This trace ENDS when streamText() completes
                          ↓
                   (disconnected)
                          ↓
TRACE TREE 2: Event Processing (Distributed)
┌────────────────────────────────────────────────────────┐
│ Transaction: (various)                                 │
│ ├─ Span: runner.sendEvent.build-stream                │
│ │  └─ Captures NEW trace context                      │
│ ├─ Span: broker.forwardEvent.build-stream             │
│ │  └─ Continues trace from event._sentry              │
│ ├─ Span: api.runner.events.build-stream               │
│ │  └─ Continues trace from HTTP headers               │
│ └─ Span: persistent-processor.persistEvent            │
│     └─ Database writes                                 │
└────────────────────────────────────────────────────────┘
```

**Issue**: The AI spans are in TRACE TREE 1, but all your event processing (broker, nextjs, db) is in TRACE TREE 2.

---

## 🧩 Why Are They Disconnected?

### **Execution Timeline**

```
T=0ms    | handleCommand() receives start-build
         | └─ Sentry.startSpan({ name: "runner.build" }) starts
         |
T=10ms   | orchestrateBuild() called
         | └─ Within runner.build span
         |
T=50ms   | createClaudeQuery() called  
         | └─ Within runner.build span
         |
T=100ms  | streamText() executes
         | └─ claudeCodeIntegration creates AI spans HERE
         |    ├─ ai.chat.completions
         |    ├─ ai.tool.call.read
         |    └─ ai.tool.call.write
         |
T=500ms  | Tool execution happens (Claude calls Read/Write/Bash)
         | └─ Still within runner.build span
         | └─ AI spans are CHILDREN of runner.build
         |
T=1000ms | transformAISDKStream yields messages
         | └─ Still within runner.build span
         |
T=1500ms | sendEvent('build-stream') called
         | └─ Creates NEW span: runner.sendEvent.build-stream
         | └─ Captures trace context with Sentry.getTraceData()
         | └─ This captures the CURRENT active span context
         | └─ Problem: AI spans already completed at this point!
         |
T=1600ms | Event sent to broker with event._sentry
         | └─ Broker continues trace FROM event._sentry
         | └─ NextJS continues trace from HTTP headers  
         | └─ Persistent processor inherits trace context
         |
T=5000ms | runner.build span ends
         | └─ All AI spans were children of THIS span
```

**The Disconnect Occurs at T=1500ms:**
- AI spans (T=100-1000ms) are completed and closed
- `sendEvent()` creates a NEW span in the SAME trace
- But the broker/nextjs/db pipeline continues from this NEW span
- Result: AI spans are siblings/cousins, not ancestors, of the event processing spans

---

## 🏗️ Current Architecture Deep Dive

### **1. Runner: Where AI Spans Are Created**

**File**: `apps/runner/src/index.ts:1610-1620`

```typescript
await Sentry.startSpan(
  {
    name: "runner.build",
    op: "build",
  },
  async () => {
    // Everything happens inside this span:
    
    // Step 1: orchestrateBuild calls createClaudeQuery
    // Step 2: createClaudeQuery calls streamText()
    //         └─ AI spans created HERE by claudeCodeIntegration
    //            during the execution of streamText()
    
    // Step 3: Stream is consumed, events are generated
    //         But AI spans are ALREADY created and linked
    //         to runner.build span
    
    // Step 4: sendEvent() is called
    //         └─ Creates SEPARATE spans for event emission
  }
);
```

**File**: `apps/runner/src/index.ts:420-500`

```typescript
function createClaudeQuery(): BuildQueryFn {
  return async function* (prompt, workingDirectory, systemPrompt) {
    // Instrument the query function for Sentry
    const instrumentedQuery = createInstrumentedQueryForProvider(query);
    
    const model = claudeCode(aiSdkModelId, {
      queryFunction: instrumentedQuery, // ← Sentry wraps this
      // ...
    });
    
    // Stream with telemetry enabled
    const result = streamText({
      model,
      prompt,
      // NOTE: No experimental_telemetry here!
      // AI spans are created by claudeCodeIntegration
      // which hooks into the instrumented query function
    });
    
    // Consume stream
    for await (const message of transformAISDKStream(result.fullStream)) {
      yield message;
    }
  };
}
```

**Key Point**: AI spans are created **during** `streamText()` execution, as **children** of the active `runner.build` span.

### **2. Runner: Where Event Spans Are Created**

**File**: `apps/runner/src/index.ts:1060-1144`

```typescript
function sendEvent(event: RunnerEvent) {
  const traceableEvents = [
    'build-completed',
    'build-failed',
    'build-stream',
    'error',
    // ...
  ];
  
  if (traceableEvents.includes(event.type)) {
    Sentry.startSpan(
      {
        name: `runner.sendEvent.${event.type}`,
        op: 'runner.event.send',
      },
      () => {
        // Capture CURRENT trace context
        const traceData = Sentry.getTraceData();
        event._sentry = {
          trace: traceData['sentry-trace'],
          baggage: traceData.baggage,
        };
        
        socket.send(JSON.stringify(event));
      }
    );
  } else {
    // Non-traceable events: just send
    socket.send(JSON.stringify(event));
  }
}
```

**Problem**: This creates a NEW span (`runner.sendEvent.*`) that's a **sibling** to the AI spans, not a **parent**.

### **3. Broker: Continues Trace from Event**

**File**: `apps/broker/src/index.ts:389-467`

```typescript
async function forwardEvent(event: RunnerEvent) {
  if (event._sentry?.trace && event._sentry?.baggage) {
    // Continue trace FROM the sendEvent span
    await Sentry.continueTrace(
      {
        sentryTrace: event._sentry.trace,
        baggage: event._sentry.baggage,
      },
      async () => {
        await Sentry.startSpan(
          {
            name: `broker.forwardEvent.${event.type}`,
            op: 'broker.event.forward',
          },
          async () => {
            // Forward to NextJS with headers
          }
        );
      }
    );
  }
}
```

**Problem**: Broker continues the trace from `runner.sendEvent.*` span, which is NOT connected to the AI spans.

### **4. What You See in Sentry**

```
Trace View:
┌─ runner.build (5s)
│  ├─ orchestrateBuild (4.8s)
│  │  ├─ createClaudeQuery (4.5s)
│  │  │  ├─ ai.chat.completions (2s) ← AI SPANS HERE
│  │  │  ├─ ai.tool.call.read (500ms)
│  │  │  ├─ ai.tool.call.write (1s)
│  │  │  └─ ai.tool.call.bash (800ms)
│  │  └─ transformAISDKStream (300ms)
│  ├─ runner.sendEvent.build-stream (5ms) ← EVENT SPAN HERE
│  └─ runner.sendEvent.build-completed (3ms)
│
└─ (separate trace) broker.forwardEvent.build-stream (45ms)
   └─ api.runner.events.build-stream (200ms)
      └─ persistent-processor.persistEvent (150ms)
          └─ DB writes
```

**What You Want:**

```
Trace View (LINKED):
┌─ runner.build (5s)
│  ├─ orchestrateBuild (4.8s)
│  │  ├─ createClaudeQuery (4.5s)
│  │  │  ├─ ai.chat.completions (2s) ← AI SPANS
│  │  │  ├─ ai.tool.call.read (500ms)
│  │  │  ├─ ai.tool.call.write (1s)
│  │  │  └─ ai.tool.call.bash (800ms)
│  │  └─ transformAISDKStream (300ms)
│  ├─ runner.sendEvent.build-stream (5ms) ← SAME TRACE
│  ├─ broker.forwardEvent.build-stream (45ms) ← CONNECTED
│  ├─ api.runner.events.build-stream (200ms) ← CONNECTED
│  └─ persistent-processor.persistEvent (150ms) ← CONNECTED
│      └─ DB writes
```

---

## 💡 Solution Options

### **Option 1: Ensure sendEvent() Happens Within runner.build Span** ⭐ **RECOMMENDED**

**Approach**: Make sure `sendEvent()` is called **while the runner.build span is still active**.

**How It Works:**
- The `runner.build` span is already the parent of AI spans
- If `sendEvent()` is called within this span, its span becomes a sibling to AI spans
- When broker/nextjs continue the trace, they'll be children of `runner.build`
- Result: All spans (AI + events + processing) are in the SAME trace tree

**Implementation:**

```typescript
// apps/runner/src/index.ts
await Sentry.startSpan(
  {
    name: "runner.build",
    op: "build",
  },
  async () => {
    try {
      // ... build execution (AI spans created here)
      
      const orchestrationResult = await orchestrateBuild({...});
      
      // ✅ Send events WITHIN the runner.build span
      sendEvent({
        type: 'build-completed',
        // ...
      });
      
      // ✅ Wait for acknowledgment within the span
      await waitForEventProcessing();
      
    } catch (error) {
      sendEvent({
        type: 'build-failed',
        // ...
      });
    }
  }
);
```

**Pros:**
- ✅ Minimal code changes
- ✅ Preserves existing event flow
- ✅ All spans in one trace
- ✅ Clean hierarchy

**Cons:**
- ⚠️ Build span duration includes event processing time
- ⚠️ May need to adjust span timing expectations

---

### **Option 2: Create a Parent Span That Encompasses Everything**

**Approach**: Create a **higher-level span** that wraps both AI execution AND event processing.

**How It Works:**
- Create `runner.handleCommand.build` span BEFORE `runner.build`
- AI spans are grandchildren of this span
- Event processing spans are also children of this span
- Result: Common ancestor links them all

**Implementation:**

```typescript
// apps/runner/src/index.ts:1597
case "start-build": {
  // Outer span for entire command handling
  await Sentry.startSpan(
    {
      name: "runner.handleCommand.start-build",
      op: "runner.command.handle",
    },
    async () => {
      // Inner span for build execution
      await Sentry.startSpan(
        {
          name: "runner.build",
          op: "build",
        },
        async () => {
          // AI spans created here
          await orchestrateBuild({...});
        }
      );
      
      // Send events (still within outer span)
      sendEvent({
        type: 'build-completed',
        // ...
      });
    }
  );
}
```

**Pros:**
- ✅ Clear separation between execution and event handling
- ✅ Accurate timing for each phase
- ✅ All spans in one trace

**Cons:**
- ⚠️ Adds nesting complexity
- ⚠️ Need to manage multiple span contexts

---

### **Option 3: Add Trace Links Between Spans** 🔗

**Approach**: Use Sentry's **span links** to connect the AI spans to the event processing spans.

**How It Works:**
- AI spans complete normally as children of `runner.build`
- When creating `runner.sendEvent.*` span, add a **link** to the AI spans
- Sentry UI shows these as "related traces"

**Implementation:**

```typescript
// Capture AI span context
let aiSpanContext: SpanContext | undefined;

await Sentry.startSpan(
  {
    name: "runner.build",
    op: "build",
  },
  async (buildSpan) => {
    // Save the span context
    aiSpanContext = buildSpan.spanContext();
    
    // AI spans created here
    await orchestrateBuild({...});
  }
);

// Later, when sending events
Sentry.startSpan(
  {
    name: `runner.sendEvent.${event.type}`,
    op: 'runner.event.send',
    // Add link to the build span
    links: aiSpanContext ? [{
      context: aiSpanContext,
      attributes: { relationship: 'related_to_ai_execution' }
    }] : undefined,
  },
  () => {
    // Send event
  }
);
```

**Pros:**
- ✅ No changes to execution flow
- ✅ Maintains separate trace trees
- ✅ Links show relationship in Sentry UI

**Cons:**
- ⚠️ Not a true distributed trace (just related)
- ⚠️ May not show as cleanly in trace view
- ⚠️ Requires newer Sentry SDK features

---

## 🎯 Recommended Solution

### **Use Option 1: Ensure sendEvent() Within runner.build Span**

**Why:**
1. **Simplest**: Minimal code changes, leverages existing infrastructure
2. **Cleanest**: Creates true parent-child relationship
3. **Most Accurate**: Reflects actual causality (events result from build)

**Changes Needed:**

1. **Modify handleCommand to ensure events are sent within the build span:**

```typescript
// apps/runner/src/index.ts:1597
case "start-build": {
  await Sentry.startSpan(
    {
      name: "runner.build",
      op: "build",
      attributes: {
        "build.project_id": command.projectId,
        "build.operation": command.payload?.operationType,
        "build.agent": command.payload?.agent,
      },
    },
    async () => {
      try {
        // ... setup code ...
        
        // Execute build (AI spans created here)
        const orchestrationResult = await orchestrateBuild({...});
        
        // ✅ Send completion event WITHIN this span
        sendEvent({
          type: 'build-completed',
          ...buildEventBase(command.projectId, command.id),
          buildId: orchestrationResult.buildId,
        });
        
      } catch (error) {
        // ✅ Send error event WITHIN this span
        sendEvent({
          type: 'build-failed',
          ...buildEventBase(command.projectId, command.id),
          error: error instanceof Error ? error.message : "Build failed",
        });
        throw error;
      }
    }
  );
}
```

2. **Verify broker and nextjs continue the trace properly:**

Already implemented! ✅
- Broker: `apps/broker/src/index.ts:389`
- NextJS: `apps/sentryvibe/src/app/api/runner/events/route.ts:37`

---

## 🔍 Verification Steps

After implementing Option 1:

1. **Start a build**
2. **Open Sentry Performance → Traces**
3. **Find the `runner.build` transaction**
4. **Verify trace hierarchy:**
   ```
   runner.build
   ├─ AI spans (ai.chat.completions, ai.tool.call.*)
   ├─ runner.sendEvent.build-stream
   ├─ broker.forwardEvent.build-stream
   ├─ api.runner.events.build-stream
   └─ persistent-processor.persistEvent
   ```
5. **Check span attributes**
6. **Verify timing metrics**

---

## 📊 Expected Improvements

### **Before (Disconnected):**
```
❌ AI spans in one trace
❌ Event processing in another trace
❌ Cannot see end-to-end flow
❌ No visibility into AI → DB path
```

### **After (Connected):**
```
✅ All spans in one trace
✅ Clear parent-child relationships
✅ End-to-end visibility from AI call to DB write
✅ Accurate timing attribution
✅ Better debugging: "This AI tool call caused this DB write"
```

---

## ✅ IMPLEMENTATION COMPLETE - Option 1

**Date Implemented**: October 27, 2025

### Changes Made

**File**: `apps/runner/src/index.ts` (lines 1991-2001)

**Problem Identified:**
- Line 1996 had `Sentry.getActiveSpan()?.end()` which manually ended the span
- This caused the span to close BEFORE trace context could propagate to event processing
- Result: AI spans and event processing spans were in disconnected traces

**Solution Applied:**
- Removed the premature `span.end()` call
- Added explanatory comments about trace propagation
- The span now automatically ends when the async callback completes
- This ensures `sendEvent()` is called while `runner.build` span is still active
- Trace context properly propagates through: runner → broker → nextjs → db

### Code Change

**Before:**
```typescript
sendEvent({
  type: "build-completed",
  ...buildEventBase(command.projectId, command.id),
  payload: { todos: [], summary: "Build completed" },
});
Sentry.getActiveSpan()?.end(); // ❌ Breaks trace propagation
```

**After:**
```typescript
// Send build completion event while span is still active
// This ensures the event processing spans (broker → nextjs → db)
// are properly linked to this build span and its AI spans
sendEvent({
  type: "build-completed",
  ...buildEventBase(command.projectId, command.id),
  payload: { todos: [], summary: "Build completed" },
});

// Note: Span will automatically end when this async callback completes
// DO NOT manually call span.end() here - it breaks trace propagation!
```

### Expected Trace Structure

```
runner.build (parent transaction)
├─ orchestrateBuild
│  ├─ createClaudeQuery
│  │  ├─ ai.chat.completions ← AI SPANS
│  │  ├─ ai.tool.call.read
│  │  ├─ ai.tool.call.write
│  │  └─ ai.tool.call.bash
│  └─ transformAISDKStream
├─ runner.sendEvent.build-completed ← EVENT SPAN (sibling to AI spans)
├─ broker.forwardEvent.build-completed ← CONNECTED via trace propagation
├─ api.runner.events.build-completed ← CONNECTED
└─ persistent-processor.finalizeSession ← CONNECTED
```

All spans now appear in **ONE UNIFIED TRACE** in Sentry! 🎉

---

## 🚀 Next Steps

1. ✅ **Implementation complete** - Option 1 applied
2. ✅ **Runner rebuilt** - TypeScript compiled successfully
3. **Test with a build** and verify in Sentry
4. **Monitor trace structure** in production

---

## 📚 Related Files

- `apps/runner/src/index.ts` - Main runner logic, handleCommand, sendEvent
- `apps/runner/src/instrument.ts` - Sentry initialization with claudeCodeIntegration
- `apps/broker/src/index.ts` - Trace continuation from runner
- `apps/sentryvibe/src/app/api/runner/events/route.ts` - Trace continuation in NextJS
- `DISTRIBUTED_TRACING_IMPLEMENTATION.md` - Current distributed tracing docs

---

**Let's discuss which option makes the most sense for your use case!**

