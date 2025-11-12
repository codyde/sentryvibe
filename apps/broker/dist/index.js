"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTANT: Sentry must be imported FIRST before any other modules
require("./instrument");
const instrument_1 = require("./instrument");
const dotenv_1 = require("dotenv");
const path_1 = require("path");
(0, dotenv_1.config)({ path: (0, path_1.resolve)(__dirname, '../.env') });
(0, dotenv_1.config)({ path: (0, path_1.resolve)(__dirname, '../.env.local'), override: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const ws_1 = require("ws");
const messages_1 = require("./shared/runner/messages");
const PORT = parseInt(process.env.PORT || process.env.BROKER_PORT || '4000', 10);
const SHARED_SECRET = process.env.RUNNER_SHARED_SECRET;
const EVENT_TARGET = process.env.RUNNER_EVENT_TARGET_URL ?? 'http://localhost:3000';
const HEARTBEAT_TIMEOUT = 90000; // 90 seconds - increased buffer for network latency
const PING_INTERVAL = 30000; // 30 seconds
if (!SHARED_SECRET) {
    console.error('[broker] RUNNER_SHARED_SECRET is required');
    process.exit(1);
}
const connections = new Map();
// Metrics tracking
let totalEvents = 0;
let totalCommands = 0;
let totalErrors = 0;
// Failed event queue for retry
const failedEvents = [];
function auth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ') || header.slice(7).trim() !== SHARED_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    return next();
}
/**
 * Retry a fetch call with exponential backoff
 */
async function fetchWithRetry(url, options, maxAttempts = 3) {
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetch(url, options);
            return response;
        }
        catch (error) {
            lastError = error;
            if (attempt < maxAttempts) {
                const delay = 1000 * attempt; // 1s, 2s, 3s
                console.log(`[broker] ⏳ Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
}
const app = (0, express_1.default)();
// Increase body size limit to handle base64-encoded images (up to 10MB)
// Images can be up to 5MB, base64 encoding adds ~33% overhead
app.use(express_1.default.json({ limit: '10mb' }));
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
    const { runnerId = 'default', command } = req.body;
    if (!command) {
        return res.status(400).json({ error: 'Missing command payload' });
    }
    const connection = connections.get(runnerId);
    if (!connection || connection.socket.readyState !== ws_1.WebSocket.OPEN) {
        return res.status(503).json({ error: 'Runner not connected' });
    }
    try {
        // Extract current trace context to pass through WebSocket
        const traceData = instrument_1.Sentry.getTraceData();
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
    }
    catch (error) {
        totalErrors++;
        instrument_1.Sentry.captureException(error, {
            tags: { runnerId, commandType: command.type },
            level: 'error',
        });
        console.error('[broker] Failed to send command', error);
        return res.status(500).json({ error: 'Failed to send command' });
    }
});
// Add Sentry error handler AFTER all routes
instrument_1.Sentry.setupExpressErrorHandler(app);
const server = (0, http_1.createServer)(app);
const wss = new ws_1.WebSocketServer({ server, path: '/socket' });
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
        if (ws.readyState === ws_1.WebSocket.OPEN) {
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
    instrument_1.Sentry.addBreadcrumb({
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
            const message = JSON.parse(data.toString());
            if ((0, messages_1.isRunnerEvent)(message)) {
                const event = message;
                // Update heartbeat on runner-status events
                if (event.type === 'runner-status') {
                    const conn = connections.get(runnerId);
                    if (conn)
                        conn.lastHeartbeat = Date.now();
                }
                totalEvents++;
                await forwardEvent(event);
            }
        }
        catch (error) {
            totalErrors++;
            instrument_1.Sentry.captureException(error, {
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
        instrument_1.Sentry.addBreadcrumb({
            category: 'websocket',
            message: `Runner disconnected: ${runnerId}`,
            level: 'info',
            data: { code },
        });
    });
    ws.on('error', (error) => {
        console.error('[broker] Runner socket error', runnerId, error);
        totalErrors++;
        instrument_1.Sentry.captureException(error, {
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
            instrument_1.Sentry.addBreadcrumb({
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
}, 60000);
// Retry failed events every 30 seconds
setInterval(async () => {
    if (failedEvents.length === 0)
        return;
    console.log(`[broker] Retrying ${failedEvents.length} failed events...`);
    // Process up to 10 events per retry cycle
    const batch = failedEvents.splice(0, 10);
    for (const item of batch) {
        try {
            const response = await fetchWithRetry(`${EVENT_TARGET.replace(/\/$/, '')}/api/runner/events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${SHARED_SECRET}`,
                },
                body: JSON.stringify(item.event),
            }, 2 // Fewer retries for background job
            );
            if (!response.ok) {
                // Re-queue if still failing, but limit attempts
                if (item.attempts < 5) {
                    failedEvents.push({ ...item, attempts: item.attempts + 1 });
                }
                else {
                    console.error(`[broker] Dropping event after 5 attempts:`, item.event.type);
                    instrument_1.Sentry.captureMessage('Event dropped after max retry attempts', {
                        level: 'warning',
                        tags: { eventType: item.event.type },
                        extra: { event: item.event },
                    });
                }
            }
        }
        catch (error) {
            // Re-queue on error
            if (item.attempts < 5) {
                failedEvents.push({ ...item, attempts: item.attempts + 1 });
            }
        }
    }
}, 30000);
server.listen(PORT, () => {
    console.log(`[broker] listening on http://localhost:${PORT}`);
    console.log(`[broker] Sentry enabled: ${!!process.env.SENTRY_DSN}`);
});
// Graceful shutdown handling
process.on('SIGTERM', async () => {
    console.log('[broker] SIGTERM received, closing connections...');
    instrument_1.Sentry.addBreadcrumb({
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
        instrument_1.Sentry.close(2000).then(() => {
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
    process.emit('SIGTERM');
});
// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('[broker] Uncaught exception:', error);
    instrument_1.Sentry.captureException(error, { level: 'fatal' });
    instrument_1.Sentry.close(2000).then(() => {
        process.exit(1);
    });
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[broker] Unhandled rejection at:', promise, 'reason:', reason);
    instrument_1.Sentry.captureException(reason, { level: 'error' });
});
async function forwardEvent(event) {
    // Continue trace if event has trace context from runner
    const forwardOperation = async () => {
        try {
            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${SHARED_SECRET}`,
            };
            // Manually set trace headers as a fallback in case automatic instrumentation fails
            // This MUST be called inside the broker.forwardEvent span for correct context
            const activeSpan = instrument_1.Sentry.getActiveSpan();
            if (activeSpan) {
                const traceData = instrument_1.Sentry.getTraceData();
                if (traceData['sentry-trace']) {
                    headers['sentry-trace'] = traceData['sentry-trace'];
                }
                if (traceData.baggage) {
                    headers['baggage'] = traceData.baggage;
                }
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
                instrument_1.Sentry.captureMessage('Failed to forward event', {
                    level: 'warning',
                    tags: { eventType: event.type, statusCode: response.status },
                    extra: { responseText: text },
                });
            }
        }
        catch (error) {
            totalErrors++;
            console.error('[broker] Error forwarding event', error);
            // Add to failed queue for retry
            failedEvents.push({ event, attempts: 1 });
            instrument_1.Sentry.captureException(error, {
                tags: { eventType: event.type, source: 'forward_event' },
                level: 'error',
            });
        }
    };
    // If event has trace context, continue the trace
    if (event._sentry?.trace && event._sentry?.baggage) {
        await instrument_1.Sentry.continueTrace({
            sentryTrace: event._sentry.trace,
            baggage: event._sentry.baggage,
        }, async () => {
            await instrument_1.Sentry.startSpan({
                name: `broker.forwardEvent.${event.type}`,
                op: 'broker.event.forward',
                attributes: {
                    'event.type': event.type,
                    'event.projectId': event.projectId,
                    'event.commandId': event.commandId,
                },
            }, async () => {
                await forwardOperation();
            });
        });
    }
    else {
        // No trace context, just forward
        await forwardOperation();
    }
}
