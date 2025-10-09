# Remote Runner Prototype Plan

## Goal
Move the "agent execution" (template download, AI build workflow, dev-server management) off the Railway-hosted Next.js app and into a locally hosted runner that connects outbound to a broker service.

## Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| **Next.js Frontend** | Railway | User experience, persistence in Postgres, calls broker REST API |
| **Broker Service** | Railway or local | Multiplex commands/events between frontend and runner |
| **Runner Daemon** | Local machine | Execute builds, manage dev servers, stream logs/events |

## Key Modules Relocation

The following server-side modules will be moved or reused inside the runner package:

- `src/lib/process-manager.ts` – process lifecycle management (reused inside runner)
- `src/lib/port-allocator.ts` – port reservation (will require async Postgres variant)
- `src/lib/templates/*` – template download/summaries
- `src/lib/generation-persistence.ts` – serialization helpers (runner will call APIs or write to DB directly)
- `src/app/api/projects/[id]/build/route.ts` – core build/generation workflow (migrated into runner command handler)
- `src/app/api/projects/[id]/start/route.ts`, `src/app/api/start-dev/route.ts` – dev server orchestration (converted to runner commands)
- `src/app/api/projects/[id]/generate/route.ts` – AI streaming logic (moved to runner)

## Command / Event Protocol

Commands issued by Railway to the runner:
- `start-build`: execute AI-driven build workflow
- `start-dev-server`: run project-specific dev command
- `stop-dev-server`: terminate dev server
- `fetch-logs`: request buffered log segments
- `runner-health-check`: prompt runner to publish status heartbeat

Events emitted by runner back to Railway:
- `ack`, `error`
- `log-chunk`, `port-detected`, `process-exited`
- `build-progress`, `build-completed`, `build-failed`
- `runner-status` (heartbeat)

Implementation reference: `shared/runner/messages.ts`. Events emitted on the broker WebSocket are forwarded to the Next.js `/api/runner/events` endpoint via HTTP (`RUNNER_EVENT_TARGET_URL`).

## Outstanding Design Questions

1. **Preview delivery** — initial prototype will forward HTTP requests through the broker, with a later option to use tunnel URLs.
2. **Persistence layer** — decide whether the runner writes directly to Postgres or marshals events that Railway persists.
3. **Authentication** — single bearer token stored in Railway env and local runner `.env` for prototype; plan rotation/expiry for production.
4. **Packaging** — initial runner starts via `pnpm run runner`; subsequent iterations bundle as binary/CLI.

## Next Steps

1. Implement standalone broker service using Express + ws.
2. Scaffold runner package with WebSocket client, command dispatcher, and integration of existing modules.
3. Refactor Next.js API routes to call the broker REST API and persist runner events via `/api/runner/events`.
