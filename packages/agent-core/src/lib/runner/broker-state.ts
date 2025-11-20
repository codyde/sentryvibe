import type { RunnerCommand } from '../../shared/runner/messages';
import * as Sentry from '@sentry/node';

const BROKER_HTTP_URL = process.env.RUNNER_BROKER_HTTP_URL ?? 'http://localhost:4000';
const SHARED_SECRET = process.env.RUNNER_SHARED_SECRET;

function getHeaders() {
  if (!SHARED_SECRET) {
    throw new Error('RUNNER_SHARED_SECRET is not configured');
  }
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${SHARED_SECRET}`,
  };
  
  // Propagate trace context for distributed tracing (frontend → broker → runner)
  // This allows seeing the full chain: API request → Runner → AI calls
  // 
  // Note: This may capture trace from concurrent Next.js routes, but runner's
  // forceTransaction:true creates a NEW transaction, preventing grouping while
  // maintaining the parent-child link for distributed tracing views.
  const traceData = Sentry.getTraceData();
  if (traceData['sentry-trace']) {
    headers['sentry-trace'] = traceData['sentry-trace'];
    if (traceData.baggage) {
      headers['baggage'] = traceData.baggage;
    }
  }
  
  return headers;
}

export async function sendCommandToRunner(runnerId: string, command: RunnerCommand) {
  const response = await fetch(`${BROKER_HTTP_URL.replace(/\/$/, '')}/commands`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ runnerId, command }),
  });

  if (!response.ok) {
    const message = await safeJson(response);
    throw new Error(message?.error ?? `Failed to dispatch command (${response.status})`);
  }
}

export async function listRunnerConnections() {
  try {
    const response = await fetch(`${BROKER_HTTP_URL.replace(/\/$/, '')}/status`, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json().catch(() => ({ connections: [] }));
    return data.connections ?? [];
  } catch (error) {
    console.error('Failed to fetch runner status:', error);
    return [];
  }
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
