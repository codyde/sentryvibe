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

if (!SHARED_SECRET) {
  console.error('RUNNER_SHARED_SECRET is required');
  process.exit(1);
}

interface RunnerConnection {
  id: string;
  socket: WebSocket;
  lastHeartbeat: number;
}

const connections = new Map<string, RunnerConnection>();

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

app.get('/status', auth, (req, res) => {
  res.json({
    connections: Array.from(connections.values()).map(({ id, lastHeartbeat }) => ({
      runnerId: id,
      lastHeartbeat,
    })),
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

  connection.socket.send(JSON.stringify(command));
  return res.json({ ok: true });
});

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
  connections.set(runnerId, { id: runnerId, socket: ws, lastHeartbeat: Date.now() });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString()) as RunnerMessage;
      if (isRunnerEvent(message)) {
        const event = message as RunnerEvent;
        if (event.type === 'runner-status') {
          const conn = connections.get(runnerId);
          if (conn) conn.lastHeartbeat = Date.now();
        }

        await forwardEvent(event);
      }
    } catch (error) {
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

async function forwardEvent(event: RunnerEvent) {
  try {
    const response = await fetchWithRetry(`${EVENT_TARGET.replace(/\/$/, '')}/api/runner/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SHARED_SECRET}`,
      },
      body: JSON.stringify(event),
    }, 3);

    if (!response.ok) {
      const text = await response.text();
      console.error('[broker] Failed to forward event', response.status, text);
    }
  } catch (error) {
    console.error('[broker] Error forwarding event', error);
  }
}
