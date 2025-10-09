import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';

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
    return { process: childProcess as any, emitter };
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

  // Handle stdout
  childProcess.stdout?.on('data', (data: Buffer) => {
    const text = data.toString();
    emitter.emit('log', { type: 'stdout', data: text });

    // Try to detect port
    const portMatch = text.match(/(?:localhost:|port[:\s]+|:)(\d{4,5})/i);
    if (portMatch) {
      const port = parseInt(portMatch[1], 10);
      if (port >= 3000 && port <= 65535) {
        emitter.emit('port', port);
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
