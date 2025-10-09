const MAX_LOG_ENTRIES = 1000;

type LogStreamEvent =
  | { type: 'log'; entry: LogEntry }
  | { type: 'exit'; payload?: { code?: number | null; signal?: string | null } };

export interface LogEntry {
  type: 'stdout' | 'stderr';
  data: string;
  timestamp: Date;
}

const logBuffers = new Map<string, LogEntry[]>();
const listeners = new Map<string, Set<(event: LogStreamEvent) => void>>();

function getBuffer(projectId: string) {
  if (!logBuffers.has(projectId)) {
    logBuffers.set(projectId, []);
  }
  return logBuffers.get(projectId)!;
}

export function appendRunnerLog(projectId: string, entry: LogEntry) {
  const buffer = getBuffer(projectId);
  buffer.push(entry);
  if (buffer.length > MAX_LOG_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_LOG_ENTRIES);
  }

  const projectListeners = listeners.get(projectId);
  if (projectListeners) {
    for (const listener of projectListeners) {
      listener({ type: 'log', entry });
    }
  }
}

export function markRunnerLogExit(
  projectId: string,
  payload?: { code?: number | null; signal?: string | null }
) {
  const projectListeners = listeners.get(projectId);
  if (projectListeners) {
    for (const listener of projectListeners) {
      listener({ type: 'exit', payload });
    }
  }
}

export function subscribeToRunnerLogs(
  projectId: string,
  listener: (event: LogStreamEvent) => void
) {
  const set = listeners.get(projectId);
  if (set) {
    set.add(listener);
  } else {
    listeners.set(projectId, new Set([listener]));
  }

  return () => {
    const current = listeners.get(projectId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      listeners.delete(projectId);
    }
  };
}

export function getRunnerLogs(projectId: string, limit?: number): LogEntry[] {
  const buffer = logBuffers.get(projectId);
  if (!buffer || buffer.length === 0) {
    return [];
  }
  if (!limit || limit >= buffer.length) {
    return [...buffer];
  }
  return buffer.slice(buffer.length - limit);
}
