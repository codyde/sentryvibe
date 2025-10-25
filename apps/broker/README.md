# SentryVibe Broker

WebSocket broker service for routing commands between the SentryVibe web app and local runners.

## Architecture

The broker serves as a persistent message router with long-lived WebSocket connections:

```
Next.js App (Port 3000)
    ↓ HTTP (POST /commands)
    ↓ HTTP (receives POST /api/runner/events)
Broker (Port 4000)
    ↓ WebSocket (persistent)
Runner Process (local machine)
```

## Features

### Core Functionality
- **WebSocket Connection Management**: Maintains persistent connections to runners
- **Command Routing**: Routes commands from Next.js to runners via WebSocket
- **Event Forwarding**: Forwards runner events to Next.js via HTTP
- **Authentication**: Bearer token auth for all endpoints and WebSocket connections

### Reliability Features
- **Graceful Shutdown**: Properly closes connections on SIGTERM/SIGINT
- **Stale Connection Cleanup**: Removes connections that haven't sent heartbeats (60s timeout)
- **Ping/Pong Keepalive**: WebSocket ping every 30 seconds to maintain connections
- **Failed Event Queue**: Automatically retries failed event forwards (up to 5 attempts)
- **Exponential Backoff**: Retry logic for network failures

### Monitoring & Observability
- **Sentry Integration**: Error tracking, performance monitoring, and profiling
- **Health Check Endpoint**: `/health` (no auth required) - for Docker/monitoring
- **Status Endpoint**: `/status` (auth required) - connection details
- **Metrics Endpoint**: `/metrics` (auth required) - usage statistics

## Environment Variables

```bash
# Required
RUNNER_SHARED_SECRET=your-secret-here

# Optional
PORT=4000                                    # HTTP/WebSocket server port
BROKER_PORT=4000                             # Alias for PORT
RUNNER_EVENT_TARGET_URL=http://localhost:3000  # Next.js app URL
NODE_ENV=production                          # Environment (development/production)

# Sentry (optional)
SENTRY_DSN=https://...@o123.ingest.sentry.io/456  # Sentry project DSN
SENTRY_RELEASE=1.0.0                        # Release version for tracking
```

## API Endpoints

### `GET /health`
Health check endpoint for monitoring and Docker health checks.

**Authentication**: None

**Response**:
```json
{
  "status": "healthy",
  "uptime": 123.45,
  "connections": 2,
  "memory": { "rss": 123456, "heapTotal": 67890, "heapUsed": 45678 },
  "timestamp": "2025-10-25T12:00:00.000Z"
}
```

### `GET /status`
Connection status and details.

**Authentication**: Bearer token

**Response**:
```json
{
  "connections": [
    {
      "runnerId": "default",
      "lastHeartbeat": 1729857600000,
      "lastHeartbeatAge": 1234
    }
  ],
  "uptime": 123.45
}
```

### `GET /metrics`
Service metrics and statistics.

**Authentication**: Bearer token

**Response**:
```json
{
  "totalEvents": 1234,
  "totalCommands": 567,
  "totalErrors": 3,
  "activeConnections": 2,
  "failedEventQueueSize": 0,
  "uptime": 123.45,
  "memory": { "rss": 123456, "heapTotal": 67890, "heapUsed": 45678 }
}
```

### `POST /commands`
Send a command to a runner.

**Authentication**: Bearer token

**Request Body**:
```json
{
  "runnerId": "default",
  "command": {
    "type": "start-build",
    "data": { ... }
  }
}
```

**Response**:
```json
{
  "ok": true
}
```

**Error Responses**:
- `400`: Missing command payload
- `503`: Runner not connected
- `500`: Failed to send command

### `WebSocket /socket?runnerId=default`
WebSocket connection for runners.

**Authentication**: Bearer token (via `Authorization` header)

**Features**:
- Automatic ping/pong keepalive (30s interval)
- Heartbeat tracking via `runner-status` events
- Automatic cleanup on disconnect
- Close code 1008 for auth failures
- Close code 1000 for graceful shutdown

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build for production
pnpm build

# Run production build
pnpm start
```

## Production Deployment

1. **Environment Setup**: Create `.env.local` with production values
2. **Build**: Run `pnpm build` to compile TypeScript
3. **Process Manager**: Use PM2, systemd, or Docker to keep the service running
4. **Monitoring**: Configure Sentry DSN for error tracking
5. **Health Checks**: Configure monitoring to ping `/health` endpoint

### Docker Example

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY dist ./dist

ENV NODE_ENV=production
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
```

## Error Handling

The broker implements comprehensive error handling:

1. **WebSocket Errors**: Logged to console and Sentry, connection removed
2. **Event Forward Failures**: Added to retry queue (5 attempts, then dropped)
3. **Command Send Failures**: Return 500 error, logged to Sentry
4. **Uncaught Exceptions**: Logged to Sentry, process exits after flush
5. **Unhandled Rejections**: Logged to Sentry, process continues

## Sentry Integration

The broker uses Sentry for:
- **Error Tracking**: All exceptions captured with context (runnerId, event type, etc.)
- **Performance Monitoring**: Trace sample rate configurable via environment
- **Profiling**: CPU profiling for performance optimization
- **Breadcrumbs**: Connection lifecycle events for debugging context

**Sentry captures**:
- WebSocket connection/disconnection events
- Failed event forwards
- Command send failures
- Stale connection removals
- Graceful shutdown events

## Connection Lifecycle

1. **Connection**: Runner connects to `ws://broker:4000/socket?runnerId=default`
2. **Authentication**: Bearer token validated, connection accepted or rejected
3. **Keepalive**: Ping every 30s, pong updates heartbeat timestamp
4. **Monitoring**: Stale connections (>60s) automatically cleaned up
5. **Disconnect**: Connection removed, ping interval cleared

## Failed Event Recovery

When event forwarding fails:

1. Event added to `failedEvents` queue with attempt counter
2. Every 30s, up to 10 failed events are retried
3. If retry succeeds, event removed from queue
4. If retry fails, attempt counter incremented
5. After 5 failed attempts, event dropped and logged to Sentry

## Message Types

### Commands (Next.js → Runner)
- `start-build`: Initiate code generation
- `start-dev-server`: Start development server
- `stop-dev-server`: Stop development server
- `start-tunnel`: Create public tunnel
- `stop-tunnel`: Close tunnel
- `read-file`, `write-file`, `list-files`: File operations
- `delete-project-files`: Cleanup
- `runner-health-check`: Status request

### Events (Runner → Next.js)
- `ack`: Command acknowledgment
- `log-chunk`: Build/process output
- `port-detected`: Dev server listening
- `tunnel-created`, `tunnel-closed`: Tunnel lifecycle
- `process-exited`: Dev server stopped
- `build-progress`, `build-completed`, `build-failed`: Build status
- `build-stream`: Real-time AI generation stream
- `project-metadata`: Project info
- `runner-status`: Heartbeat/health
- `error`: Error events

## Security

- **Bearer Token Authentication**: All endpoints and WebSocket connections require valid token
- **HTTPS Recommended**: Use HTTPS in production (via reverse proxy)
- **Secret Management**: Store `RUNNER_SHARED_SECRET` securely (env vars, secrets manager)
- **Rate Limiting**: Consider adding rate limiting for production deployments

## Performance

- **Memory**: ~50-100MB typical usage
- **CPU**: Minimal (<5%) when idle, spikes during message routing
- **Latency**: <10ms for command routing (WebSocket → WebSocket)
- **Throughput**: Handles 1000+ messages/second on modern hardware

## Troubleshooting

### Runner Not Connecting
1. Check `RUNNER_SHARED_SECRET` matches on both sides
2. Verify broker is running and port is accessible
3. Check broker logs for connection attempts
4. Test WebSocket endpoint: `wscat -c ws://localhost:4000/socket?runnerId=test -H "Authorization: Bearer YOUR_SECRET"`

### Events Not Reaching Next.js
1. Check `RUNNER_EVENT_TARGET_URL` is correct
2. Verify Next.js is running and `/api/runner/events` endpoint is accessible
3. Check broker logs for forward failures
4. Inspect `/metrics` endpoint for `failedEventQueueSize`

### Stale Connections
1. Check runner heartbeat interval (should send events regularly)
2. Network issues may cause silent disconnects
3. Check `/status` endpoint for `lastHeartbeatAge`
4. Stale connections auto-removed after 60s

### High Error Count
1. Check `/metrics` for `totalErrors`
2. Review Sentry dashboard for error details
3. Check Next.js availability (common cause)
4. Inspect network connectivity between services

## License

MIT
