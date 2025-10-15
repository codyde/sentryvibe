"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
if (!SHARED_SECRET) {
    console.error('RUNNER_SHARED_SECRET is required');
    process.exit(1);
}
const connections = new Map();
function auth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ') || header.slice(7).trim() !== SHARED_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    return next();
}
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.get('/status', auth, (req, res) => {
    res.json({
        connections: Array.from(connections.values()).map(({ id, lastHeartbeat }) => ({
            runnerId: id,
            lastHeartbeat,
        })),
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
    connection.socket.send(JSON.stringify(command));
    return res.json({ ok: true });
});
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
    connections.set(runnerId, { id: runnerId, socket: ws, lastHeartbeat: Date.now() });
    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data.toString());
            if ((0, messages_1.isRunnerEvent)(message)) {
                const event = message;
                if (event.type === 'runner-status') {
                    const conn = connections.get(runnerId);
                    if (conn)
                        conn.lastHeartbeat = Date.now();
                }
                await forwardEvent(event);
            }
        }
        catch (error) {
            console.error('[broker] Failed to handle message', error);
        }
    });
    ws.on('close', (code) => {
        console.log('[broker] Runner disconnected', runnerId, code);
        connections.delete(runnerId);
    });
    ws.on('error', (error) => {
        console.error('[broker] Runner socket error', runnerId, error);
        connections.delete(runnerId);
    });
});
server.listen(PORT, () => {
    console.log(`[broker] listening on http://localhost:${PORT}`);
});
async function forwardEvent(event) {
    try {
        const response = await fetch(`${EVENT_TARGET.replace(/\/$/, '')}/api/runner/events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${SHARED_SECRET}`,
            },
            body: JSON.stringify(event),
        });
        if (!response.ok) {
            const text = await response.text();
            console.error('[broker] Failed to forward event', response.status, text);
        }
    }
    catch (error) {
        console.error('[broker] Error forwarding event', error);
    }
}
