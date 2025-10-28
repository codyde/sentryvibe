# Add Distributed Tracing Across Full Event Flow

## 🎯 Overview

Implements **complete distributed tracing** from runner execution through broker routing to database persistence, providing end-to-end visibility into event processing and performance.

## 🔍 Problem

Previously, we had traces for command handling (`handleCommand`) but lacked explicit tracing for:
- Event emission from runner → broker
- Event forwarding from broker → Next.js
- Event processing in Next.js → persistent processor
- Database writes and persistence operations

This made it difficult to:
- Identify performance bottlenecks across services
- Attribute errors to specific components
- Measure database operation timing
- Debug event flow issues

## ✅ Solution

Added **explicit Sentry spans** at each step of the event flow:

1. **Runner**: Spans around `sendEvent()` for critical events
2. **Broker**: Spans around `forwardEvent()` with trace continuation
3. **Next.js API**: Spans around event processing with trace continuation
4. **Persistent Processor**: Spans around `persistEvent()` and `finalizeSession()`

### Trace Propagation

```
Runner (creates span)
  ├─ Captures trace context → event._sentry
  └─ Sends via WebSocket
      ↓
Broker (continues trace)
  ├─ Extracts event._sentry
  ├─ Creates span
  └─ Adds HTTP headers: sentry-trace, baggage
      ↓
Next.js API (continues trace)
  ├─ Extracts HTTP headers
  ├─ Creates span
  └─ Calls publishRunnerEvent
      ↓
Persistent Processor (inherits trace)
  ├─ Creates span
  └─ Writes to database
```

## 📊 Changes

### Files Modified

1. **apps/runner/src/index.ts**
   - Wrapped `sendEvent()` in `Sentry.startSpan()`
   - Added trace context capture to `event._sentry`
   - Events traced: `build-stream`, `build-completed`, `build-failed`, `error`, etc.

2. **apps/broker/src/index.ts**
   - Wrapped `forwardEvent()` in `Sentry.continueTrace()` + `Sentry.startSpan()`
   - Extracts trace from `event._sentry`
   - Propagates via HTTP headers

3. **apps/sentryvibe/src/app/api/runner/events/route.ts**
   - Added `Sentry.continueTrace()` from HTTP headers
   - Wrapped `publishRunnerEvent()` in span

4. **packages/agent-core/src/lib/runner/persistent-event-processor.ts**
   - Wrapped `persistEvent()` in spans
   - Wrapped `finalizeSession()` in spans
   - Captures database operation timing

### Documentation Added

1. **COMMUNICATION_FLOW_ANALYSIS.md** - Complete technical flow documentation
2. **FLOW_DIAGRAM.md** - Visual diagrams and simplified explanations
3. **DEBUG_GUIDE.md** - Practical troubleshooting guide
4. **DISTRIBUTED_TRACING_IMPLEMENTATION.md** - Detailed tracing architecture
5. **TRACING_IMPLEMENTATION_SUMMARY.md** - Quick reference and deployment guide

## 🎯 Benefits

### Before
```
User: "Builds are slow"
Dev: *Adds console.logs everywhere*
     *Checks broker logs*
     *Checks database logs*
     *Maybe it's the runner?*
     → Hours of debugging
```

### After
```
User: "Builds are slow"
Dev: *Opens Sentry trace*
     → "Database writes taking 4.5s"
     → 2 minutes to identify root cause
```

### Key Improvements

- 🔍 **Visibility**: Complete path from execution to database
- ⚡ **Performance**: Instant bottleneck identification
- 🛡️ **Reliability**: Error propagation tracking
- 🐛 **Debugging**: Exact component attribution
- 📊 **Monitoring**: Dashboard metrics for system health

## 📈 Example Trace

```
Transaction: handleCommand (start-build)
Duration: 5.2 seconds

├─ runner.sendEvent.build-stream [5ms]
├─ broker.forwardEvent.build-stream [45ms]
├─ api.runner.events.build-stream [200ms]
│   └─ persistent-processor.persistEvent.tool-input [180ms]
│       ├─ DB INSERT generation_todos [80ms]
│       ├─ DB INSERT generation_tool_calls [20ms]
│       ├─ DB SELECT refreshRawState [60ms]
│       └─ WebSocket broadcast [10ms]
├─ runner.sendEvent.build-completed [8ms]
├─ broker.forwardEvent.build-completed [40ms]
└─ api.runner.events.build-completed [80ms]
    └─ persistent-processor.finalizeSession.completed [60ms]
```

## 🔍 What You Can Debug Now

### Scenario 1: Slow Database Writes
```
Trace shows: persistent-processor.persistEvent: 5s
Drill down: DB INSERT generation_todos: 4.8s
Action: Check connection pool, optimize batch inserts
```

### Scenario 2: Broker Latency
```
Trace shows: broker.forwardEvent: 2.5s
Action: Check network, Next.js server load, timeout config
```

### Scenario 3: Missing Events
```
Trace shows: runner.sendEvent exists, no broker.forwardEvent
Conclusion: WebSocket dropped
Action: Check broker logs, implement retry, add monitoring
```

## ✅ Testing

### Manual Testing
1. Start all services (Next.js, Broker, Runner)
2. Create a project and start a build
3. Open Sentry dashboard
4. Look for transaction: `handleCommand`
5. Verify spans:
   - ✅ `runner.sendEvent.*`
   - ✅ `broker.forwardEvent.*`
   - ✅ `api.runner.events.*`
   - ✅ `persistent-processor.persistEvent.*`

### Expected Results
- ✅ All spans in correct hierarchy
- ✅ Trace context propagates across services
- ✅ Timing metrics are reasonable
- ✅ Attributes populated correctly
- ✅ No broken traces or orphaned spans

## 🚀 Performance Impact

- **Minimal overhead**: Spans only on critical events (not heartbeats)
- **No new network calls**: Uses existing event flow
- **Async operations**: No blocking on span creation
- **Selective tracing**: Only traces important events

## 📋 Deployment Notes

- **No breaking changes**: Backward compatible
- **No configuration needed**: Works out of the box with existing Sentry setup
- **No database migrations**: No schema changes
- **No environment variables**: Uses existing Sentry configuration

## 🔗 Related Issues

This PR addresses the need for better observability and debugging capabilities discussed in the communication flow analysis session.

## 📚 Documentation

All documentation is included in this PR:
- See `TRACING_IMPLEMENTATION_SUMMARY.md` for quick reference
- See `DISTRIBUTED_TRACING_IMPLEMENTATION.md` for detailed architecture
- See `DEBUG_GUIDE.md` for troubleshooting

---

## Review Checklist

- [ ] All spans appear in Sentry traces
- [ ] Trace context propagates correctly
- [ ] Performance metrics look reasonable
- [ ] No linter errors
- [ ] Documentation is clear and complete

