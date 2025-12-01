# N+1 Query Fix - Persistent Event Processor

## Issue Summary

**Issue**: N+1 Query - persistent-processor.persistEvent.tool-input-available  
**Sentry Issue**: https://buildwithcode.sentry.io/issues/6977830586/  
**Date Fixed**: 2025-11-12

## Problem Description

The `buildSnapshot` function in the persistent event processor was executing 5 sequential database queries to reconstruct state after every write operation. Even though the queries were parallelized using `Promise.all()`, each query was acquiring a separate connection from the PostgreSQL connection pool, resulting in excessive `pg-pool.connect` operations.

### Observed Trace Pattern

The Sentry trace showed:
- 7+ separate `pg-pool.connect` calls (one per query)
- 1 SELECT for session (11ms)
- 1 SELECT for project (19ms)  
- 1 SELECT for todos (8ms)
- 1 SELECT for tool calls (21ms)
- 1 SELECT for notes (15ms)
- 1 UPDATE for session (13ms)

Total: **6+ database connections acquired** for a single state refresh operation.

## Root Cause

While the queries were being executed in parallel, they were not using a shared database connection. Each query would:
1. Acquire a connection from the pool
2. Execute the query
3. Return the connection to the pool

This pattern is inefficient and creates connection pool churn, especially under load.

## Solution

Wrapped all 5 read queries in a **single database transaction**, which:
1. Acquires **one connection** from the pool
2. Executes all queries on that same connection (still in parallel via `Promise.all()`)
3. Returns the connection to the pool after all queries complete

### Code Changes

**File**: `packages/agent-core/src/lib/runner/persistent-event-processor.ts`

**Before**:
```typescript
async function buildSnapshot(context: ActiveBuildContext): Promise<GenerationState> {
  const [sessionRow] = await db
    .select()
    .from(generationSessions)
    .where(eq(generationSessions.id, context.sessionId))
    .limit(1);

  const [projectRow, todoRows, toolRows, noteRows] = await Promise.all([
    db.select().from(projects)...,
    db.select().from(generationTodos)...,
    db.select().from(generationToolCalls)...,
    db.select().from(generationNotes)...,
  ]);
  // ... rest of function
}
```

**After**:
```typescript
async function buildSnapshot(context: ActiveBuildContext): Promise<GenerationState> {
  // Use a transaction to execute all queries on a single connection
  return await db.transaction(async (tx) => {
    const [sessionRow] = await tx
      .select()
      .from(generationSessions)
      .where(eq(generationSessions.id, context.sessionId))
      .limit(1);

    // Parallelize independent database queries on the same transaction connection
    const [projectRow, todoRows, toolRows, noteRows] = await Promise.all([
      tx.select().from(projects)...,
      tx.select().from(generationTodos)...,
      tx.select().from(generationToolCalls)...,
      tx.select().from(generationNotes)...,
    ]);
    // ... rest of function
    return snapshot;
  });
}
```

## Benefits

1. **Connection Pool Efficiency**: Reduces from 5+ connections per state refresh to 1 connection
2. **Reduced Latency**: Eliminates overhead of acquiring/releasing multiple connections
3. **Better Scalability**: Lower connection pool pressure allows more concurrent operations
4. **Consistent State**: Transaction isolation ensures all queries see a consistent snapshot of the database

## Performance Impact

### Expected Improvements
- **Connection Pool Churn**: Reduced by 83% (5 connections → 1 connection)
- **Latency**: Estimated 10-20ms reduction in connection acquisition overhead
- **Throughput**: Better performance under load with reduced connection contention

### When Most Impactful
This fix is most beneficial when:
- Processing multiple TodoWrite operations concurrently
- Under high load with many active generation sessions
- Connection pool is near capacity

## Testing

- ✅ TypeScript compilation successful
- ✅ No linter errors
- ✅ Drizzle ORM transaction API correctly applied

## Related Files

- `packages/agent-core/src/lib/runner/persistent-event-processor.ts` (modified)

## Notes

The transaction approach maintains all existing functionality while improving performance:
- Queries still execute in parallel via `Promise.all()`
- Error handling remains the same (transaction will rollback on error)
- Read-only operations don't require transaction semantics, but benefit from connection reuse
- No breaking changes to the function signature or return value
