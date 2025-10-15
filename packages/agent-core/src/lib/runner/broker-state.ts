import type { RunnerCommand } from '../../shared/runner/messages';

const BROKER_HTTP_URL = process.env.RUNNER_BROKER_HTTP_URL ?? 'http://localhost:4000';
const SHARED_SECRET = process.env.RUNNER_SHARED_SECRET;

function getHeaders() {
  if (!SHARED_SECRET) {
    throw new Error('RUNNER_SHARED_SECRET is not configured');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${SHARED_SECRET}`,
  };
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
