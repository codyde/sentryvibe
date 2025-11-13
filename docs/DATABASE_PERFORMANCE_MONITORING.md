# Database Performance Monitoring with Sentry

This document explains how to use Sentry to investigate and fix database performance issues in SentryVibe.

## Overview

SentryVibe now includes comprehensive database performance monitoring through Sentry's PostgreSQL integration. This allows you to:

- Identify slow database queries
- Track query execution times
- Analyze database performance bottlenecks
- Optimize queries based on real performance data

## What's Been Configured

### 1. Automatic PostgreSQL Query Tracing

The `postgresIntegration()` has been added to `apps/sentryvibe/sentry.server.config.ts`:

```typescript
integrations: [
  Sentry.postgresIntegration(), // Automatic tracing for PostgreSQL queries
  // ... other integrations
]
```

This automatically instruments all PostgreSQL queries made through the `pg` library (which Drizzle ORM uses internally).

### 2. Manual Performance Spans

Additional performance spans have been added to track specific database operations:

#### Projects API (`/api/projects`)
- **GET**: List all projects
- **POST**: Check slug collisions and create new projects

#### Single Project API (`/api/projects/[id]`)
- **GET**: Fetch single project by ID
- **PATCH**: Update project details (already instrumented)

#### Messages API (`/api/projects/[id]/messages`)
- **GET**: Complex query with multiple related tables:
  - Project messages
  - Generation sessions
  - Todos, tool calls, and notes (queried in parallel)

## How to Use This for Performance Investigation

### 1. Access Sentry Performance Dashboard

1. Go to your Sentry dashboard: https://o4508130833793024.ingest.us.sentry.io/
2. Navigate to **Performance** → **Database**
3. You'll see metrics for all database queries

### 2. Identify Slow Queries

Look for queries with:
- High average duration (> 100ms)
- High P95/P99 latency
- High throughput (queries per minute)

### 3. Analyze Query Details

Click on any query to see:
- Full SQL statement
- Execution time distribution
- Sample traces showing the query in context
- Database table and operation type

### 4. Use Query Attributes for Filtering

Each instrumented query includes attributes like:
```typescript
{
  'db.table': 'projects',
  'db.operation': 'select',
  'project.id': 'uuid-here',
  'session.count': 5
}
```

Use these to filter and analyze specific scenarios.

## Common Performance Issues & Solutions

### Issue 1: N+1 Query Problem

**Symptom**: Multiple queries for related data in the messages endpoint

**Current Implementation**: The messages route fetches sessions, then uses `inArray()` to fetch todos, tool calls, and notes in parallel.

**Already Optimized**: We use `Promise.all()` to run related queries in parallel:
```typescript
const [todos, toolCalls, notes] = await Promise.all([
  // Parallel execution of related queries
]);
```

**Further Optimization**: Consider using JOIN queries if latency is still high.

### Issue 2: Missing Indexes

**How to Detect**: 
1. Look for queries with high duration in Sentry
2. Check the query plan (you may need to run `EXPLAIN` manually)

**Tables with Indexes**:
- `projects`: `runner_id_idx`, `status_idx`, `last_activity_idx`
- `running_processes`: `runner_id_idx`
- `generation_sessions`: `project_id_idx`, `build_id_unique`
- `generation_todos`: `session_id_idx`, `session_index_unique`
- `generation_tool_calls`: `session_id_idx`, `tool_call_unique`
- `generation_notes`: `session_id_idx`, `text_id_unique`

**Action**: If queries are slow on non-indexed columns, add indexes.

### Issue 3: Large Result Sets

**How to Detect**: Queries returning many rows (visible in Sentry attributes)

**Solution**: Implement pagination:
- The messages endpoint already has cursor support planned
- Add `LIMIT` and `OFFSET` to large queries
- Use cursor-based pagination for infinite scroll

### Issue 4: Complex WHERE Clauses

**How to Detect**: High duration on queries with multiple conditions

**Solution**: 
- Add composite indexes on commonly filtered columns
- Consider denormalizing data for read-heavy operations

## Example: Investigating Slow Project List

1. **Identify the Issue**: Sentry shows `db.query.projects.list` taking 500ms

2. **Check the Query**: 
   ```sql
   SELECT * FROM projects ORDER BY created_at
   ```

3. **Analyze**:
   - Are there many projects? (Check row count in Sentry)
   - Is the `created_at` column indexed? (Check schema)
   - Are related data being fetched? (Check N+1 patterns)

4. **Optimize**:
   - Add index on `created_at` if missing
   - Implement pagination with `LIMIT`
   - Consider caching results

## Monitoring in Development

### Using Sentry Spotlight

Sentry Spotlight is enabled in development for real-time debugging:

```typescript
spotlight: true,
integrations: [
  Sentry.spotlightIntegration(),
  // ...
]
```

1. Start your app: `sentryvibe run --dev`
2. Open Spotlight: Usually at http://localhost:8969
3. Interact with the app
4. See database queries appear in real-time with timing

### Debugging Specific Queries

To debug a specific slow query:

1. Find the query in Sentry Performance
2. Note the `trace_id` from a slow sample
3. Search for that trace in Sentry to see the full request context
4. Look at the waterfall view to see where time is spent

## Performance Baselines

Based on the schema and typical usage:

### Fast Queries (< 10ms)
- Single project by ID: `SELECT * FROM projects WHERE id = ?`
- Message insert: `INSERT INTO messages ...`

### Medium Queries (10-50ms)
- List projects: `SELECT * FROM projects ORDER BY created_at`
- Generation session by project: `SELECT * FROM generation_sessions WHERE project_id = ?`

### Complex Queries (50-200ms)
- Messages with all relations (sessions + todos + tools + notes)
- This is expected due to multiple tables being joined

### Slow Queries (> 200ms) - NEEDS OPTIMIZATION
- Any query taking over 200ms should be investigated
- Check for missing indexes, large result sets, or N+1 patterns

## Setting Up Alerts

You can configure Sentry alerts for slow queries:

1. Go to **Alerts** in Sentry
2. Create a new alert rule
3. Set conditions like:
   - When database query duration > 200ms
   - For more than 10 requests in 5 minutes
4. Configure notification channels

## Database Query Metrics

Track these key metrics:

- **Average Duration**: Overall query performance
- **P95/P99 Duration**: Tail latency (worst-case scenarios)
- **Throughput**: Queries per second
- **Error Rate**: Failed queries

## Next Steps

1. **Run Load Tests**: Use the app with realistic data volumes
2. **Monitor Production**: Watch Sentry dashboards for patterns
3. **Optimize Hot Paths**: Focus on the most-called queries first
4. **Add Caching**: Consider Redis for frequently accessed data
5. **Database Tuning**: Adjust PostgreSQL settings if needed

## Resources

- [Sentry Database Monitoring Docs](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/postgres/)
- [PostgreSQL Performance Tips](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Drizzle ORM Performance](https://orm.drizzle.team/docs/performance)
