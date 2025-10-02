import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

interface DevServerProcess {
  pid: number;
  process: ChildProcess;
  projectId: string;
  emitter: EventEmitter;
  logs: string[];
  startTime: Date;
}

// In-memory store of running processes
const runningProcesses = new Map<string, DevServerProcess>();

export interface StartDevServerOptions {
  projectId: string;
  command: string;
  cwd: string;
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

  // Parse command (e.g., "npm run dev" -> ["npm", "run", "dev"])
  const [cmd, ...args] = command.split(' ');

  console.log(`🚀 Starting dev server for ${projectId}`);
  console.log(`   Command: ${command}`);
  console.log(`   CWD: ${cwd}`);

  // Spawn process with proper shell environment
  const childProcess = spawn(cmd, args, {
    cwd,
    shell: true,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'], // Explicitly set stdio
    env: { ...process.env, FORCE_COLOR: '0' }, // Disable colors in output
  });

  if (!childProcess.pid) {
    throw new Error('Failed to start process');
  }

  console.log(`   PID: ${childProcess.pid}`);

  let detectedPort: number | null = null;

  // Capture stdout
  childProcess.stdout?.on('data', (data: Buffer) => {
    const text = data.toString();
    logs.push(text);
    console.log(`[${projectId}] stdout:`, text);

    // Emit log event
    emitter.emit('log', {
      timestamp: new Date(),
      type: 'stdout',
      data: text,
    } as DevServerLog);

    // Try to detect port with multiple patterns
    if (!detectedPort) {
      const portMatch =
        text.match(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})/i) ||  // URL format
        text.match(/port[:\s]+(\d{4,5})/i) ||                              // "port: 3001" or "port 3001"
        text.match(/Local:.*?:(\d{4,5})/i) ||                              // Next.js format
        text.match(/ready.*?(\d{4,5})/i);                                   // Vite format

      if (portMatch) {
        const port = parseInt(portMatch[1], 10);
        // Validate it's a reasonable port number
        if (port >= 3000 && port <= 65535) {
          detectedPort = port;
          console.log(`   Port detected: ${detectedPort}`);
          emitter.emit('port', detectedPort);
        }
      }
    }
  });

  // Capture stderr
  childProcess.stderr?.on('data', (data: Buffer) => {
    const text = data.toString();
    logs.push(text);
    console.log(`[${projectId}] stderr:`, text);

    emitter.emit('log', {
      timestamp: new Date(),
      type: 'stderr',
      data: text,
    } as DevServerLog);
  });

  // Handle exit
  childProcess.on('exit', (code) => {
    console.log(`❌ Process ${projectId} exited with code ${code}`);
    emitter.emit('exit', code);
    runningProcesses.delete(projectId);
  });

  // Handle errors
  childProcess.on('error', (error) => {
    console.error(`❌ Process ${projectId} error:`, error);
    emitter.emit('error', error);
    runningProcesses.delete(projectId);
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
    return true;
  } catch (error) {
    console.error('Error stopping process:', error);
    return false;
  }
}

export function getProcessInfo(projectId: string): DevServerProcess | undefined {
  return runningProcesses.get(projectId);
}

export function getAllProcesses(): Map<string, DevServerProcess> {
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
