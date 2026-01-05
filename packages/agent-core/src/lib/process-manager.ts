import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { buildLogger } from './logging/build-logger';

interface DevServerProcess {
  pid: number;
  process: ChildProcess;
  projectId: string;
  emitter: EventEmitter;
  logs: string[];
  startTime: Date;
}

// Global singleton to survive Next.js HMR (Hot Module Reload)
// Without this, the Map gets cleared every time routes recompile
declare global {
  var __devProcesses: Map<string, DevServerProcess> | undefined;
}

// In-memory store of running processes (survives HMR)
const runningProcesses = global.__devProcesses || new Map<string, DevServerProcess>();
global.__devProcesses = runningProcesses;

buildLogger.log('info', 'process-manager', 'Process manager initialized', { processCount: runningProcesses.size });

export interface StartDevServerOptions {
  projectId: string;
  command: string;
  cwd: string;
  env?: Record<string, string>;
}

export interface DevServerLog {
  timestamp: Date;
  type: 'stdout' | 'stderr';
  data: string;
}

export function startDevServer(options: StartDevServerOptions): {
  pid: number;
  port: number | null;
  emitter: EventEmitter;
} {
  const { projectId, command, cwd } = options;

  // Kill existing process if any
  stopDevServer(projectId);

  const emitter = new EventEmitter();
  const logs: string[] = [];

  buildLogger.processManager.processStarting(projectId, command, cwd);

  // Spawn process using shell to handle full command
  // Don't split - let shell handle it (supports pipes, &&, env vars, etc)
  const childProcess = spawn(command, {
    cwd,
    shell: true,
    detached: false,
    stdio: ['pipe', 'pipe', 'pipe'], // Keep stdin open (some servers need it)
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      // Ensure CI mode is off (prevents auto-exit)
      CI: 'false',
      NODE_ENV: 'development',
      ...(options.env || {}),
    },
  });

  if (!childProcess.pid) {
    throw new Error('Failed to start process');
  }

  buildLogger.processManager.processStarted(projectId, childProcess.pid);

  // Keep stdin open but don't write to it (prevents "no tty" exits)
  if (childProcess.stdin) {
    childProcess.stdin.on('error', (err) => {
      buildLogger.log('debug', 'process-manager', `stdin error: ${err.message}`, { projectId });
    });
    childProcess.stdin.on('close', () => {
      buildLogger.log('debug', 'process-manager', 'stdin closed', { projectId });
    });
  }

  let detectedPort: number | null = null;
  const startTime = Date.now();

  // Capture stdout
  childProcess.stdout?.on('data', (data: Buffer) => {
    const text = data.toString().replace(/\u001b\[[0-9;]*m/g, '');
    logs.push(text);
    buildLogger.processManager.processOutput(projectId, text);

    // Emit log event
    emitter.emit('log', {
      timestamp: new Date(),
      type: 'stdout',
      data: text,
    } as DevServerLog);

    // Try to detect port with multiple patterns
    if (!detectedPort) {
      // Skip lines mentioning ports that are "in use" or "busy" (e.g., Vite's "Port 5173 is in use, trying another one...")
      if (text.match(/in use|busy|unavailable|already/i)) {
        buildLogger.log('debug', 'process-manager', `Skipping "in use" port message: ${text.trim()}`, { projectId });
      } else {
        const sanitized = text;
        const portMatch =
          sanitized.match(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})/i) ||
          sanitized.match(/Local:?[^\d]*(\d{4,5})/i) ||
          sanitized.match(/ready[^\d]*(\d{4,5})/i) ||
          sanitized.match(/http:\/\/[^\s]+:(\d{4,5})/i) ||
          sanitized.match(/https:\/\/[^\s]+:(\d{4,5})/i) ||
          sanitized.match(/Network:?[^\d]*(\d{4,5})/i) ||
          sanitized.match(/started server on[^\d]*(\d{4,5})/i) ||
          sanitized.match(/listening on[^\d]*(\d{4,5})/i) ||
          sanitized.match(/port[^\d]*(\d{4,5})/i);

        if (portMatch) {
          const port = parseInt(portMatch[1], 10);
          // Validate it's a reasonable port number
          if (port >= 3000 && port <= 65535) {
            detectedPort = port;
            buildLogger.log('info', 'process-manager', `Port detected: ${detectedPort}`, { projectId, port: detectedPort });
            emitter.emit('port', detectedPort);
          }
        }
      }
    }
  });

  // Capture stderr
  childProcess.stderr?.on('data', (data: Buffer) => {
    const text = data.toString().replace(/\u001b\[[0-9;]*m/g, '');
    logs.push(text);
    buildLogger.processManager.processError(projectId, text);

    emitter.emit('log', {
      timestamp: new Date(),
      type: 'stderr',
      data: text,
    } as DevServerLog);
  });

  // Handle exit
  childProcess.on('exit', (code, signal) => {
    const timeAlive = Date.now() - startTime;
    buildLogger.processManager.processExited(projectId, code, signal);

    if (timeAlive < 5000) {
      buildLogger.log('error', 'process-manager', 'Process died within 5 seconds - likely a startup error', { 
        projectId, 
        timeAlive, 
        code, 
        signal 
      });
    }

    if (code === 0) {
      buildLogger.log('warn', 'process-manager', 'Process exited cleanly (code 0) - check if it received exit signal', { 
        projectId, 
        timeAlive 
      });
    }

    emitter.emit('exit', { code, signal });
    runningProcesses.delete(projectId);
    buildLogger.log('debug', 'process-manager', 'Removed from Map', { 
      projectId, 
      mapSize: runningProcesses.size 
    });
  });

  // Handle errors
  childProcess.on('error', (error) => {
    buildLogger.processManager.error('Process error', error, { projectId });
    emitter.emit('error', error);
    runningProcesses.delete(projectId);
  });

  // Handle close event (different from exit)
  childProcess.on('close', (code, signal) => {
    buildLogger.log('debug', 'process-manager', 'Process closed', { projectId, code, signal });
  });

  // Handle disconnect
  childProcess.on('disconnect', () => {
    buildLogger.log('debug', 'process-manager', 'Process disconnected', { projectId });
  });

  // Store in memory
  const processInfo: DevServerProcess = {
    pid: childProcess.pid,
    process: childProcess,
    projectId,
    emitter,
    logs,
    startTime: new Date(),
  };

  runningProcesses.set(projectId, processInfo);
  buildLogger.log('debug', 'process-manager', 'Stored process in Map', { projectId, mapSize: runningProcesses.size });

  return {
    pid: childProcess.pid,
    port: detectedPort,
    emitter,
  };
}

export function stopDevServer(projectId: string): boolean {
  const processInfo = runningProcesses.get(projectId);

  if (!processInfo) {
    return false;
  }

  try {
    // Kill the process
    processInfo.process.kill('SIGTERM');

    // If still running after 2 seconds, force kill
    setTimeout(() => {
      if (!processInfo.process.killed) {
        processInfo.process.kill('SIGKILL');
      }
    }, 2000);

    runningProcesses.delete(projectId);
    buildLogger.processManager.processStopped(projectId);
    return true;
  } catch (error) {
    buildLogger.processManager.error('Error stopping process', error, { projectId });
    return false;
  }
}

export function getProcessInfo(projectId: string): DevServerProcess | undefined {
  const info = runningProcesses.get(projectId);
  buildLogger.log('debug', 'process-manager', `getProcessInfo(${projectId})`, { 
    found: !!info, 
    mapSize: runningProcesses.size,
    mapKeys: Array.from(runningProcesses.keys())
  });
  return info;
}

export function getAllProcesses(): Map<string, DevServerProcess> {
  buildLogger.processManager.processListRetrieved(runningProcesses.size);
  return runningProcesses;
}

export function getProcessLogs(projectId: string, limit?: number): string[] {
  const processInfo = runningProcesses.get(projectId);
  if (!processInfo) {
    return [];
  }

  if (limit) {
    return processInfo.logs.slice(-limit);
  }

  return processInfo.logs;
}

export function killAllProcesses(): void {
  for (const [projectId] of runningProcesses) {
    stopDevServer(projectId);
  }
}
