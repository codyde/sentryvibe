# Database Performance Monitoring - Quick Reference

## 🚀 Quick Start

```bash
# Start app with monitoring enabled
sentryvibe run --dev

# View real-time traces
open http://localhost:8969

# View production metrics
open https://sentry.io
```

## 📊 Where to Find Performance Data

### Sentry Dashboard
1. Go to **Performance** → **Database**
2. See all database queries with timing
3. Click any query for details

### Spotlight (Dev Only)
1. Start app: `sentryvibe run --dev`
2. Open: http://localhost:8969
3. Make API requests
4. See traces in real-time

## 🎯 Performance Thresholds

| Status | Duration | Action |
|--------|----------|--------|
| 🟢 Good | < 50ms | No action needed |
| 🟡 Warning | 50-200ms | Monitor, optimize if frequent |
| 🔴 Critical | > 200ms | **Investigate immediately** |

## 🔍 Instrumented Endpoints

All these endpoints now track database performance:

| Endpoint | Queries Tracked |
|----------|----------------|
| `GET /api/projects` | List all projects |
| `POST /api/projects` | Slug check, insert project, insert message |
| `GET /api/projects/[id]` | Fetch single project |
| `PATCH /api/projects/[id]` | Update project |
| `GET /api/projects/[id]/messages` | Messages, sessions, todos, tools, notes |

## 🏷️ Span Names Reference

| Span Name | What It Tracks |
|-----------|---------------|
| `db.query.projects.list` | Listing all projects |
| `db.query.projects.byId` | Fetching single project |
| `db.query.projects.checkSlug` | Slug collision check |
| `db.insert.projects` | Creating new project |
| `db.insert.messages` | Inserting message |
| `db.update.projects` | Updating project |
| `db.query.messages` | Fetching messages |
| `db.query.generationSessions` | Fetching sessions |
| `db.query.generationTodos` | Fetching todos |
| `db.query.generationToolCalls` | Fetching tool calls |
| `db.query.generationNotes` | Fetching notes |

## 🔧 Adding Instrumentation

### Basic Pattern
```typescript
import * as Sentry from '@sentry/nextjs';

const result = await Sentry.startSpan(
  {
    name: 'db.query.tableName.action',
    op: 'db.query',
    attributes: {
      'db.table': 'table_name',
      'project.id': id,
    },
  },
  async () => {
    return await db.select().from(table)...;
  }
);
```

### Parallel Queries
```typescript
const [a, b, c] = await Promise.all([
  Sentry.startSpan({...}, async () => await query1()),
  Sentry.startSpan({...}, async () => await query2()),
  Sentry.startSpan({...}, async () => await query3()),
]);
```

## 📈 Common Issues & Quick Fixes

### Issue: Slow project list (> 200ms)
```typescript
// ❌ BAD: No pagination
const all = await db.select().from(projects);

// ✅ GOOD: With pagination
const page = await db.select().from(projects)
  .limit(50)
  .offset(page * 50);
```

### Issue: N+1 queries in loop
```typescript
// ❌ BAD: Multiple queries
for (const session of sessions) {
  const todos = await db.select()
    .from(todos)
    .where(eq(todos.sessionId, session.id));
}

// ✅ GOOD: Single batch query
const sessionIds = sessions.map(s => s.id);
const allTodos = await db.select()
  .from(todos)
  .where(inArray(todos.sessionId, sessionIds));
```

### Issue: Missing index
```sql
-- Check in Sentry if queries on these columns are slow
-- Add index in schema.ts:

export const projects = pgTable('projects', {
  // columns...
}, (table) => ({
  createdAtIdx: index('projects_created_at_idx').on(table.createdAt),
}));
```

## 📚 Documentation Links

- **Investigation Guide**: [docs/DATABASE_PERFORMANCE_MONITORING.md](./DATABASE_PERFORMANCE_MONITORING.md)
- **Instrumentation Guide**: [docs/ADDING_DATABASE_INSTRUMENTATION.md](./ADDING_DATABASE_INSTRUMENTATION.md)
- **Implementation Summary**: [docs/IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
- **Sentry Docs**: https://docs.sentry.io/product/performance/

## 🔐 Current Database Indexes

These are already optimized:

**Projects**
- `runner_id_idx` (runner_id)
- `status_idx` (status)
- `last_activity_idx` (last_activity_at)

**Sessions**
- `project_id_idx` (project_id)
- `build_id_unique` (build_id)

**Todos**
- `session_id_idx` (session_id)
- `session_index_unique` (session_id, todo_index)

**Tool Calls**
- `session_id_idx` (session_id)
- `tool_call_unique` (session_id, tool_call_id)

**Notes**
- `session_id_idx` (session_id)
- `text_id_unique` (session_id, text_id)

## ⚡ Performance Tips

1. **Add LIMIT** to all list queries
2. **Use inArray()** instead of loops for related data
3. **Run related queries in parallel** with Promise.all()
4. **Add indexes** on frequently filtered columns
5. **Cache** frequently accessed data
6. **Monitor P95/P99** latency, not just average

## 🚨 Setting Up Alerts

Sentry → Alerts → New Alert:
- Metric: Database query duration
- Threshold: > 200ms
- For: > 10 requests in 5 minutes
- Notify: Email/Slack

## 💡 Pro Tips

- Use **Spotlight** for debugging specific queries
- Check **waterfall view** to see query ordering
- Filter by **attributes** (project.id, db.table)
- Compare **before/after** when optimizing
- Set **baselines** for each endpoint
- Review **weekly** for trends

---

**Need Help?** Check the full guides in the `docs/` directory!
