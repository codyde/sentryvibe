// IMPORTANT: Sentry must be imported FIRST before any other modules
import './instrument';
import { Sentry } from './instrument';

import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv({ path: resolve(__dirname, '../.env.local'), override: true });
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { RunnerCommand, RunnerEvent, RunnerMessage } from './shared/runner/messages';
import { isRunnerEvent } from './shared/runner/messages';

const PORT = parseInt(process.env.PORT || process.env.BROKER_PORT || '4000', 10);
const SHARED_SECRET = process.env.RUNNER_SHARED_SECRET;
const EVENT_TARGET = process.env.RUNNER_EVENT_TARGET_URL ?? 'http://localhost:3000';
const HEARTBEAT_TIMEOUT = 60_000; // 60 seconds
const PING_INTERVAL = 30_000; // 30 seconds

if (!SHARED_SECRET) {
  console.error('[broker] RUNNER_SHARED_SECRET is required');
  process.exit(1);
}

interface RunnerConnection {
  id: string;
  socket: WebSocket;
  lastHeartbeat: number;
  pingInterval: NodeJS.Timeout;
}

const connections = new Map<string, RunnerConnection>();

// Metrics tracking
let totalEvents = 0;
let totalCommands = 0;
let totalErrors = 0;

// Failed event queue for retry
const failedEvents: Array<{ event: RunnerEvent; attempts: number }> = [];

function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ') || header.slice(7).trim() !== SHARED_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

/**
 * Retry a fetch call with exponential backoff
 */
async function fetchWithRetry(url: string, options: RequestInit, maxAttempts = 3): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts) {
        const delay = 1000 * attempt; // 1s, 2s, 3s
        console.log(`[broker] ⏳ Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

const app = express();
app.use(express.json());

// Health check endpoint (no auth - for monitoring/Docker health checks)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    connections: connections.size,
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  });
});

// Status endpoint (with auth)
app.get('/status', auth, (req, res) => {
  res.json({
    connections: Array.from(connections.values()).map(({ id, lastHeartbeat }) => ({
      runnerId: id,
      lastHeartbeat,
      lastHeartbeatAge: Date.now() - lastHeartbeat,
    })),
    uptime: process.uptime(),
  });
});

// Metrics endpoint (with auth)
app.get('/metrics', auth, (req, res) => {
  res.json({
    totalEvents,
    totalCommands,
    totalErrors,
    activeConnections: connections.size,
    failedEventQueueSize: failedEvents.length,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

app.post('/commands', auth, (req, res) => {
  const { runnerId = 'default', command } = req.body as { runnerId?: string; command?: RunnerCommand };

  if (!command) {
    return res.status(400).json({ error: 'Missing command payload' });
  }

  const connection = connections.get(runnerId);
  if (!connection || connection.socket.readyState !== WebSocket.OPEN) {
    return res.status(503).json({ error: 'Runner not connected' });
  }

  try {
    // Extract current trace context to pass through WebSocket
    const traceData = Sentry.getTraceData();

    // Add trace context to command payload
    const commandWithTrace = {
      ...command,
      _sentry: {
        trace: traceData['sentry-trace'],
        baggage: traceData.baggage,
      },
    };

    connection.socket.send(JSON.stringify(commandWithTrace));
    totalCommands++;
    return res.json({ ok: true });
  } catch (error) {
    totalErrors++;
    Sentry.captureException(error, {
      tags: { runnerId, commandType: command.type },
      level: 'error',
    });
    console.error('[broker] Failed to send command', error);
    return res.status(500).json({ error: 'Failed to send command' });
  }
});

// Add Sentry error handler AFTER all routes
Sentry.setupExpressErrorHandler(app);

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/socket' });

wss.on('connection', (ws, request) => {
  const header = request.headers['authorization'];
  if (!header || header !== `Bearer ${SHARED_SECRET}`) {
    ws.close(1008, 'Unauthorized');
    return;
  }

  const origin = request.headers.host ? `http://${request.headers.host}` : 'http://localhost';
  const url = new URL(request.url ?? '/socket', origin);
  const runnerId = url.searchParams.get('runnerId') ?? 'default';

  console.log('[broker] Runner connected', runnerId);

  // Setup ping/pong keepalive
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, PING_INTERVAL);

  connections.set(runnerId, {
    id: runnerId,
    socket: ws,
    lastHeartbeat: Date.now(),
    pingInterval,
  });

  // Sentry breadcrumb for connection
  Sentry.addBreadcrumb({
    category: 'websocket',
    message: `Runner connected: ${runnerId}`,
    level: 'info',
  });

  ws.on('pong', () => {
    const conn = connections.get(runnerId);
    if (conn) {
      conn.lastHeartbeat = Date.now();
    }
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString()) as RunnerMessage;
      if (isRunnerEvent(message)) {
        const event = message as RunnerEvent;

        // Update heartbeat on runner-status events
        if (event.type === 'runner-status') {
          const conn = connections.get(runnerId);
          if (conn) conn.lastHeartbeat = Date.now();
        }

        totalEvents++;
        await forwardEvent(event);
      }
    } catch (error) {
      totalErrors++;
      Sentry.captureException(error, {
        tags: { runnerId, source: 'websocket_message' },
        level: 'error',
      });
      console.error('[broker] Failed to handle message', error);
    }
  });

  ws.on('close', (code) => {
    console.log('[broker] Runner disconnected', runnerId, code);
    const conn = connections.get(runnerId);
    if (conn) {
      clearInterval(conn.pingInterval);
    }
    connections.delete(runnerId);

    Sentry.addBreadcrumb({
      category: 'websocket',
      message: `Runner disconnected: ${runnerId}`,
      level: 'info',
      data: { code },
    });
  });

  ws.on('error', (error) => {
    console.error('[broker] Runner socket error', runnerId, error);
    totalErrors++;

    Sentry.captureException(error, {
      tags: { runnerId, source: 'websocket_error' },
      level: 'error',
    });

    const conn = connections.get(runnerId);
    if (conn) {
      clearInterval(conn.pingInterval);
    }
    connections.delete(runnerId);
  });
});

// Cleanup stale connections every 60 seconds
setInterval(() => {
  const now = Date.now();
  connections.forEach((conn, runnerId) => {
    if (now - conn.lastHeartbeat > HEARTBEAT_TIMEOUT) {
      console.log(`[broker] Removing stale connection: ${runnerId}`);

      Sentry.addBreadcrumb({
        category: 'websocket',
        message: `Stale connection removed: ${runnerId}`,
        level: 'warning',
        data: { age: now - conn.lastHeartbeat },
      });

      clearInterval(conn.pingInterval);
      conn.socket.close(1000, 'Heartbeat timeout');
      connections.delete(runnerId);
    }
  });
}, 60_000);

// Retry failed events every 30 seconds
setInterval(async () => {
  if (failedEvents.length === 0) return;

  console.log(`[broker] Retrying ${failedEvents.length} failed events...`);

  // Process up to 10 events per retry cycle
  const batch = failedEvents.splice(0, 10);

  for (const item of batch) {
    try {
      const response = await fetchWithRetry(
        `${EVENT_TARGET.replace(/\/$/, '')}/api/runner/events`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SHARED_SECRET}`,
          },
          body: JSON.stringify(item.event),
        },
        2 // Fewer retries for background job
      );

      if (!response.ok) {
        // Re-queue if still failing, but limit attempts
        if (item.attempts < 5) {
          failedEvents.push({ ...item, attempts: item.attempts + 1 });
        } else {
          console.error(`[broker] Dropping event after 5 attempts:`, item.event.type);
          Sentry.captureMessage('Event dropped after max retry attempts', {
            level: 'warning',
            tags: { eventType: item.event.type },
            extra: { event: item.event },
          });
        }
      }
    } catch (error) {
      // Re-queue on error
      if (item.attempts < 5) {
        failedEvents.push({ ...item, attempts: item.attempts + 1 });
      }
    }
  }
}, 30_000);

server.listen(PORT, () => {
  console.log(`[broker] listening on http://localhost:${PORT}`);
  console.log(`[broker] Sentry enabled: ${!!process.env.SENTRY_DSN}`);
});

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('[broker] SIGTERM received, closing connections...');

  Sentry.addBreadcrumb({
    category: 'lifecycle',
    message: 'SIGTERM received, starting graceful shutdown',
    level: 'info',
  });

  // Close all WebSocket connections gracefully
  connections.forEach((conn) => {
    clearInterval(conn.pingInterval);
    conn.socket.close(1000, 'Server shutting down');
  });
  connections.clear();

  // Close WebSocket server
  wss.close(() => {
    console.log('[broker] WebSocket server closed');
  });

  // Close HTTP server
  server.close(() => {
    console.log('[broker] HTTP server closed');

    // Flush Sentry events before exit
    Sentry.close(2000).then(() => {
      console.log('[broker] Sentry flushed');
      process.exit(0);
    });
  });

  // Force exit after 10s
  setTimeout(() => {
    console.error('[broker] Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', async () => {
  console.log('[broker] SIGINT received, shutting down...');
  process.emit('SIGTERM' as any);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[broker] Uncaught exception:', error);
  Sentry.captureException(error, { level: 'fatal' });
  Sentry.close(2000).then(() => {
    process.exit(1);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[broker] Unhandled rejection at:', promise, 'reason:', reason);
  Sentry.captureException(reason, { level: 'error' });
});

async function forwardEvent(event: RunnerEvent) {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SHARED_SECRET}`,
    };

    // Propagate Sentry trace headers if present
    if (event._sentry?.trace) {
      headers['sentry-trace'] = event._sentry.trace;
    }
    if (event._sentry?.baggage) {
      headers['baggage'] = event._sentry.baggage;
    }

    const response = await fetchWithRetry(`${EVENT_TARGET.replace(/\/$/, '')}/api/runner/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify(event),
    }, 3);

    if (!response.ok) {
      const text = await response.text();
      console.error('[broker] Failed to forward event', response.status, text);

      // Add to failed queue for retry
      failedEvents.push({ event, attempts: 1 });

      Sentry.captureMessage('Failed to forward event', {
        level: 'warning',
        tags: { eventType: event.type, statusCode: response.status },
        extra: { responseText: text },
      });
    }
  } catch (error) {
    totalErrors++;
    console.error('[broker] Error forwarding event', error);

    // Add to failed queue for retry
    failedEvents.push({ event, attempts: 1 });

    Sentry.captureException(error, {
      tags: { eventType: event.type, source: 'forward_event' },
      level: 'error',
    });
  }
}
