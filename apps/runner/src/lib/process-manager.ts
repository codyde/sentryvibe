import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import { isPortReady } from './port-checker.js';

// Silent mode for TUI
let isSilentMode = false;

export function setSilentMode(silent: boolean): void {
  isSilentMode = silent;
}

/**
 * Get API configuration (evaluated at runtime, not module load time)
 */
function getAPIConfig() {
  return {
    apiBase: process.env.API_BASE_URL || 'http://localhost:3000',
    secret: process.env.RUNNER_SHARED_SECRET,
  };
}

/**
 * Make authenticated API call to frontend
 */
async function callAPI(endpoint: string, options: RequestInit = {}) {
  const { apiBase, secret } = getAPIConfig();

  try {
    const response = await fetch(`${apiBase}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${secret}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API call failed (${response.status}): ${error}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`API call to ${endpoint} failed:`, error);
    throw error;
  }
}

interface DevServerOptions {
  projectId: string;
  command: string;
  cwd: string;
  env: Record<string, string>;
}

interface DevServerProcess {
  process: ChildProcess;
  emitter: EventEmitter;
}

const activeProcesses = new Map<string, DevServerProcess>();

/**
 * Start a development server for a project
 */
export function startDevServer(options: DevServerOptions): DevServerProcess {
  const { projectId, command, cwd, env } = options;

  if (!isSilentMode) console.log(`[process-manager] Starting dev server for project: ${projectId}`);
  if (!isSilentMode) console.log(`[process-manager] Command: ${command}`);
  if (!isSilentMode) console.log(`[process-manager] CWD: ${cwd}`);

  // Stop any existing process for this project
  stopDevServer(projectId);

  const emitter = new EventEmitter();

  // Verify CWD exists
  if (!existsSync(cwd)) {
    const error = new Error(`Working directory does not exist: ${cwd}`);
    console.error(`[process-manager]`, error.message);
    emitter.emit('error', error);
    // Return a dummy process since we can't spawn
    return { process: null as any, emitter };
  }

  // Use shell to execute the full command (handles complex args better)
  const childProcess = spawn(command, [], {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'pipe',
    shell: '/bin/bash', // Explicitly use bash instead of default shell
  });

  if (!isSilentMode) console.log(`[process-manager] Child process spawned, PID: ${childProcess.pid}`);

  const devProcess: DevServerProcess = {
    process: childProcess,
    emitter,
  };

  activeProcesses.set(projectId, devProcess);

  // Register process with API
  if (childProcess.pid) {
    const runnerId = process.env.RUNNER_ID || 'unknown';
    callAPI('/api/runner/process/register', {
      method: 'POST',
      body: JSON.stringify({
        projectId,
        pid: childProcess.pid,
        command,
        runnerId,
        startedAt: new Date().toISOString(),
      }),
    })
      .then(() => {
        if (!isSilentMode) console.log(`[process-manager] ✅ Registered process via API: PID ${childProcess.pid}, Runner ${runnerId}`);
      })
      .catch((err: unknown) => {
        console.error(`[process-manager] ❌ Failed to register process via API:`, err);
      });
  }

  // Track if we've already emitted a port for this process
  let portEmitted = false;
  let portVerificationInProgress = false;

  // Handle stdout
  childProcess.stdout?.on('data', (data: Buffer) => {
    const text = data.toString();
    emitter.emit('log', { type: 'stdout', data: text });

    // Try to detect port (only emit once per project)
    if (!portEmitted && !portVerificationInProgress) {
      const portMatch = text.match(/(?:localhost:|port[:\s]+|:)(\d{4,5})/i);
      if (portMatch) {
        const port = parseInt(portMatch[1], 10);
        if (port >= 3000 && port <= 65535) {
          portVerificationInProgress = true;

          // Verify port is actually listening before emitting
          if (!isSilentMode) console.log(`[process-manager] Detected potential port ${port}, verifying...`);

          // Give the server a moment to fully bind
          setTimeout(async () => {
            const ready = await isPortReady(port, 'localhost', 2000);
            if (ready && !portEmitted) {
              portEmitted = true;
              if (!isSilentMode) console.log(`[process-manager] ✅ Verified port ${port} is listening`);
              emitter.emit('port', port);

              // Update port via API
              callAPI(`/api/runner/process/${projectId}/port`, {
                method: 'PATCH',
                body: JSON.stringify({ port }),
              })
                .then(() => {
                  if (!isSilentMode) console.log(`[process-manager] ✅ Updated port ${port} via API`);
                })
                .catch((err: unknown) => {
                  console.error(`[process-manager] ❌ Failed to update port via API:`, err);
                });
            } else if (!ready) {
              if (!isSilentMode) console.log(`[process-manager] ⚠️  Port ${port} not ready, will retry on next output`);
              portVerificationInProgress = false;
            }
          }, 500);
        }
      }
    }
  });

  // Handle stderr
  childProcess.stderr?.on('data', (data: Buffer) => {
    emitter.emit('log', { type: 'stderr', data: data.toString() });
  });

  // Handle exit
  childProcess.on('exit', (code, signal) => {
    emitter.emit('exit', { code, signal });
    activeProcesses.delete(projectId);

    // Unregister process via API
    callAPI(`/api/runner/process/${projectId}`, {
      method: 'DELETE',
    })
      .then(() => {
        if (!isSilentMode) console.log(`[process-manager] ✅ Unregistered process via API`);
      })
      .catch((err: unknown) => {
        console.error(`[process-manager] ❌ Failed to unregister process via API:`, err);
      });
  });

  // Handle errors
  childProcess.on('error', (error) => {
    console.error(`[process-manager] Process error for ${projectId}:`, error);
    emitter.emit('error', error);
  });

  return devProcess;
}

/**
 * Stop a development server for a project
 */
export function stopDevServer(projectId: string): boolean {
  const devProcess = activeProcesses.get(projectId);
  if (!devProcess) {
    return false;
  }

  devProcess.process.kill('SIGTERM');
  activeProcesses.delete(projectId);
  return true;
}

/**
 * Get active process for a project
 */
export function getDevServer(projectId: string): DevServerProcess | undefined {
  return activeProcesses.get(projectId);
}
