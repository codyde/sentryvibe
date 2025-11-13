# Adding Database Performance Instrumentation

This guide shows how to add Sentry performance tracking to new database queries in SentryVibe.

## Quick Example

### Before: Un-instrumented Query

```typescript
export async function GET(req: Request) {
  const users = await db.select().from(users).where(eq(users.active, true));
  return NextResponse.json({ users });
}
```

### After: Instrumented Query

```typescript
import * as Sentry from '@sentry/nextjs';

export async function GET(req: Request) {
  const users = await Sentry.startSpan(
    {
      name: 'db.query.users.active',
      op: 'db.query',
      attributes: {
        'db.table': 'users',
        'db.operation': 'select',
        'filter': 'active',
      },
    },
    async () => {
      return await db.select().from(users).where(eq(users.active, true));
    }
  );
  
  return NextResponse.json({ users });
}
```

## Step-by-Step Guide

### 1. Import Sentry

At the top of your API route file:

```typescript
import * as Sentry from '@sentry/nextjs';
```

### 2. Wrap Database Queries

Use `Sentry.startSpan()` to wrap any database operation:

```typescript
const result = await Sentry.startSpan(
  {
    name: 'span-name',           // Human-readable name
    op: 'db.query',              // Operation type
    attributes: { /* ... */ },   // Contextual data
  },
  async () => {
    // Your database query here
    return await db.select()...;
  }
);
```

### 3. Choose Appropriate Span Names

Follow this convention: `db.<operation>.<table>.<context>`

**Examples:**
- `db.query.projects.list` - Listing projects
- `db.query.projects.byId` - Fetching single project
- `db.insert.messages` - Creating a message
- `db.update.projects.status` - Updating project status
- `db.delete.projects` - Deleting a project

### 4. Set Operation Type

Use standard operation types:

- `db.query` - SELECT operations
- `db.insert` - INSERT operations
- `db.update` - UPDATE operations
- `db.delete` - DELETE operations

### 5. Add Useful Attributes

Include contextual information to help with debugging:

```typescript
attributes: {
  'db.table': 'projects',           // Table being queried
  'db.operation': 'select',         // SQL operation
  'project.id': projectId,          // Related entity ID
  'filter': 'status=pending',       // Filter conditions
  'session.count': sessionIds.length, // Related record count
  'user.id': userId,                // User context
}
```

## Complex Examples

### Multiple Related Queries

When fetching related data, wrap each query separately:

```typescript
// Fetch parent
const project = await Sentry.startSpan(
  {
    name: 'db.query.projects.byId',
    op: 'db.query',
    attributes: { 'db.table': 'projects', 'project.id': id },
  },
  async () => {
    return await db.select().from(projects).where(eq(projects.id, id));
  }
);

// Fetch children
const messages = await Sentry.startSpan(
  {
    name: 'db.query.messages.byProject',
    op: 'db.query',
    attributes: { 'db.table': 'messages', 'project.id': id },
  },
  async () => {
    return await db.select().from(messages).where(eq(messages.projectId, id));
  }
);
```

### Parallel Queries

Use `Promise.all()` to run queries in parallel while tracking each separately:

```typescript
const [todos, toolCalls, notes] = await Promise.all([
  Sentry.startSpan(
    {
      name: 'db.query.todos',
      op: 'db.query',
      attributes: { 'db.table': 'generation_todos', 'session.count': sessionIds.length },
    },
    async () => {
      return await db
        .select()
        .from(generationTodos)
        .where(inArray(generationTodos.sessionId, sessionIds));
    }
  ),
  Sentry.startSpan(
    {
      name: 'db.query.toolCalls',
      op: 'db.query',
      attributes: { 'db.table': 'generation_tool_calls', 'session.count': sessionIds.length },
    },
    async () => {
      return await db
        .select()
        .from(generationToolCalls)
        .where(inArray(generationToolCalls.sessionId, sessionIds));
    }
  ),
  Sentry.startSpan(
    {
      name: 'db.query.notes',
      op: 'db.query',
      attributes: { 'db.table': 'generation_notes', 'session.count': sessionIds.length },
    },
    async () => {
      return await db
        .select()
        .from(generationNotes)
        .where(inArray(generationNotes.sessionId, sessionIds));
    }
  ),
]);
```

### Conditional Queries

Handle optional queries gracefully:

```typescript
const todos = sessionIds.length > 0
  ? await Sentry.startSpan(
      {
        name: 'db.query.todos',
        op: 'db.query',
        attributes: { 'db.table': 'generation_todos', 'session.count': sessionIds.length },
      },
      async () => {
        return await db
          .select()
          .from(generationTodos)
          .where(inArray(generationTodos.sessionId, sessionIds));
      }
    )
  : [];
```

### Insert/Update Operations

```typescript
// Insert
const [newProject] = await Sentry.startSpan(
  {
    name: 'db.insert.projects',
    op: 'db.insert',
    attributes: { 'db.table': 'projects', 'slug': slug },
  },
  async () => {
    return await db.insert(projects).values({
      name: 'My Project',
      slug: slug,
      status: 'pending',
    }).returning();
  }
);

// Update
const [updatedProject] = await Sentry.startSpan(
  {
    name: 'db.update.projects.status',
    op: 'db.update',
    attributes: { 
      'db.table': 'projects',
      'project.id': id,
      'update.fields': 'status',
    },
  },
  async () => {
    return await db
      .update(projects)
      .set({ status: 'completed' })
      .where(eq(projects.id, id))
      .returning();
  }
);
```

## When to Add Instrumentation

Add performance tracking when:

### ✅ Always Instrument
- **All database queries in API routes** - Track API performance
- **Complex queries with multiple joins** - Identify bottlenecks
- **Queries inside loops** - Catch N+1 problems
- **Frequently called queries** - Monitor hot paths

### ⚠️ Consider Instrumenting
- **Background jobs** - Track async operations
- **Data migrations** - Monitor migration performance
- **Batch operations** - See bulk operation costs

### ❌ Skip Instrumentation
- **One-off scripts** - Not production code
- **Test fixtures** - Test data setup
- **Already instrumented by postgres integration** - Don't duplicate

## Automatic vs Manual Instrumentation

### Automatic (via postgresIntegration)

The `postgresIntegration()` automatically captures:
- Raw SQL queries
- Query execution time
- Connection pool stats
- Error tracking

**Advantages:**
- Zero code changes
- Captures everything automatically
- No maintenance overhead

**Limitations:**
- Less context about business logic
- Generic span names
- Can't filter by custom attributes

### Manual (via startSpan)

Manual instrumentation adds:
- Business context (project IDs, user IDs)
- Meaningful span names
- Custom attributes for filtering
- Logical grouping of related queries

**Use Both:**
- Postgres integration gives you the raw data
- Manual spans give you the business context

## Best Practices

### 1. Be Consistent with Naming

Follow the naming convention across your codebase:
```typescript
'db.query.projects.list'
'db.query.projects.byId'
'db.query.projects.bySlug'
```

### 2. Add Relevant Attributes

Include data that helps you filter and debug:
```typescript
attributes: {
  'db.table': 'projects',
  'project.id': id,
  'runner.id': runnerId,  // If relevant
  'query.limit': limit,   // For pagination
}
```

### 3. Don't Leak Sensitive Data

Avoid including:
- ❌ User passwords
- ❌ API keys
- ❌ Personal information
- ❌ Full query with sensitive data

Use IDs and names instead:
```typescript
attributes: {
  'project.id': id,        // ✅ Good
  'project.name': name,    // ✅ Good
  'user.email': email,     // ❌ Bad (PII)
}
```

### 4. Keep Spans Focused

Each span should represent one logical operation:

**Good:**
```typescript
// One span per query
const projects = await Sentry.startSpan({...}, () => db.select()...);
const messages = await Sentry.startSpan({...}, () => db.select()...);
```

**Bad:**
```typescript
// Too many operations in one span
const data = await Sentry.startSpan({...}, async () => {
  const projects = await db.select()...;
  const messages = await db.select()...;
  const filtered = projects.filter(...);
  return { projects, messages, filtered };
});
```

### 5. Use Descriptive Names

Make span names searchable and meaningful:

**Good:**
- `db.query.projects.active`
- `db.query.messages.recent`
- `db.insert.projects.withDefaults`

**Bad:**
- `query1`
- `fetch`
- `getData`

## Testing Your Instrumentation

### 1. Check Spotlight (Development)

```bash
sentryvibe run --dev
```

Open http://localhost:8969 to see spans in real-time.

### 2. Verify in Sentry Dashboard

1. Make some API requests
2. Go to Sentry Performance
3. Filter by operation: `db.query`, `db.insert`, etc.
4. Check that your spans appear with correct attributes

### 3. Check Span Hierarchy

In Sentry's trace view, verify:
- Parent span (HTTP request)
  - Child span (your manual span)
    - Child span (postgres integration span)

## Common Mistakes

### ❌ Mistake 1: Forgetting to Return

```typescript
// BAD - query result is lost!
await Sentry.startSpan({...}, async () => {
  await db.select()...;  // No return!
});
```

```typescript
// GOOD - result is captured
const result = await Sentry.startSpan({...}, async () => {
  return await db.select()...;  // Return the result
});
```

### ❌ Mistake 2: Missing Await

```typescript
// BAD - span ends before query completes
const promise = Sentry.startSpan({...}, async () => {
  return await db.select()...;
});
// Span already closed here!
const result = await promise;
```

```typescript
// GOOD - await the entire span
const result = await Sentry.startSpan({...}, async () => {
  return await db.select()...;
});
```

### ❌ Mistake 3: Too Much in One Span

```typescript
// BAD - mixes DB and business logic
const result = await Sentry.startSpan(
  { name: 'db.query.projects', op: 'db.query' },
  async () => {
    const projects = await db.select()...;
    const filtered = projects.filter(p => p.status === 'active');
    const sorted = filtered.sort((a, b) => ...);
    return sorted;
  }
);
```

```typescript
// GOOD - only the DB query
const projects = await Sentry.startSpan(
  { name: 'db.query.projects', op: 'db.query' },
  async () => {
    return await db.select()...;
  }
);

// Process after fetching
const filtered = projects.filter(p => p.status === 'active');
const sorted = filtered.sort((a, b) => ...);
```

## More Examples

Check these files for real-world examples:
- `apps/sentryvibe/src/app/api/projects/route.ts`
- `apps/sentryvibe/src/app/api/projects/[id]/route.ts`
- `apps/sentryvibe/src/app/api/projects/[id]/messages/route.ts`

## Questions?

Refer to:
- [Sentry Performance Documentation](https://docs.sentry.io/product/performance/)
- [Sentry Node SDK](https://docs.sentry.io/platforms/javascript/guides/node/)
- `docs/DATABASE_PERFORMANCE_MONITORING.md` for investigation guide
