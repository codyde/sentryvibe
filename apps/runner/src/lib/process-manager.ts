import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import { isPortReady } from './port-checker.js';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { runningProcesses } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';

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

  console.log(`[process-manager] Starting dev server for project: ${projectId}`);
  console.log(`[process-manager] Command: ${command}`);
  console.log(`[process-manager] CWD: ${cwd}`);

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

  console.log(`[process-manager] Child process spawned, PID: ${childProcess.pid}`);

  const devProcess: DevServerProcess = {
    process: childProcess,
    emitter,
  };

  activeProcesses.set(projectId, devProcess);

  // Persist to database
  if (childProcess.pid) {
    db.insert(runningProcesses)
      .values({
        projectId,
        pid: childProcess.pid,
        command,
        port: null,
        startedAt: new Date(),
        healthCheckFailCount: 0,
      })
      .onConflictDoUpdate({
        target: runningProcesses.projectId,
        set: {
          pid: childProcess.pid,
          command,
          port: null,
          startedAt: new Date(),
          healthCheckFailCount: 0,
        },
      })
      .then(() => {
        console.log(`[process-manager] ✅ Persisted process to database: PID ${childProcess.pid}`);
      })
      .catch((err) => {
        console.error(`[process-manager] ❌ Failed to persist process to database:`, err);
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
          console.log(`[process-manager] Detected potential port ${port}, verifying...`);

          // Give the server a moment to fully bind
          setTimeout(async () => {
            const ready = await isPortReady(port, 'localhost', 2000);
            if (ready && !portEmitted) {
              portEmitted = true;
              console.log(`[process-manager] ✅ Verified port ${port} is listening`);
              emitter.emit('port', port);

              // Update database with detected port
              db.update(runningProcesses)
                .set({
                  port,
                  lastHealthCheck: new Date(),
                })
                .where(eq(runningProcesses.projectId, projectId))
                .then(() => {
                  console.log(`[process-manager] ✅ Updated port ${port} in database`);
                })
                .catch((err) => {
                  console.error(`[process-manager] ❌ Failed to update port in database:`, err);
                });
            } else if (!ready) {
              console.log(`[process-manager] ⚠️  Port ${port} not ready, will retry on next output`);
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

    // Remove from database
    db.delete(runningProcesses)
      .where(eq(runningProcesses.projectId, projectId))
      .then(() => {
        console.log(`[process-manager] ✅ Removed process from database`);
      })
      .catch((err) => {
        console.error(`[process-manager] ❌ Failed to remove process from database:`, err);
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
