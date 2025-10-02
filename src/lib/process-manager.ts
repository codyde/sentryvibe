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

// Global singleton to survive Next.js HMR (Hot Module Reload)
// Without this, the Map gets cleared every time routes recompile
declare global {
  var __devProcesses: Map<string, DevServerProcess> | undefined;
}

// In-memory store of running processes (survives HMR)
const runningProcesses = global.__devProcesses || new Map<string, DevServerProcess>();
global.__devProcesses = runningProcesses;

console.log('🔧 Process manager initialized, current processes:', runningProcesses.size);

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

  console.log(`🚀 Starting dev server for ${projectId}`);
  console.log(`   Command: ${command}`);
  console.log(`   CWD: ${cwd}`);

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
    },
  });

  if (!childProcess.pid) {
    throw new Error('Failed to start process');
  }

  console.log(`   PID: ${childProcess.pid}`);
  console.log(`   Process spawned successfully`);
  console.log(`   stdin connected: ${!!childProcess.stdin}`);
  console.log(`   stdout connected: ${!!childProcess.stdout}`);
  console.log(`   stderr connected: ${!!childProcess.stderr}`);

  // Keep stdin open but don't write to it (prevents "no tty" exits)
  if (childProcess.stdin) {
    childProcess.stdin.on('error', (err) => {
      console.log(`[${projectId}] stdin error:`, err.message);
    });
    childProcess.stdin.on('close', () => {
      console.log(`[${projectId}] stdin closed`);
    });
  }

  let detectedPort: number | null = null;
  const startTime = Date.now();

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
  childProcess.on('exit', (code, signal) => {
    const timeAlive = Date.now() - startTime;
    console.log(`❌ Process ${projectId} exited`);
    console.log(`   Exit code: ${code}`);
    console.log(`   Signal: ${signal}`);
    console.log(`   Time alive: ${timeAlive}ms`);
    console.log(`   Expected behavior: Dev servers should NOT exit`);

    if (timeAlive < 5000) {
      console.error(`   ⚠️  QUICK EXIT: Process died within 5 seconds - likely a startup error`);
    }

    if (code === 0) {
      console.error(`   ⚠️  EXIT CODE 0: Process exited cleanly - check if it received exit signal`);
    }

    emitter.emit('exit', code);
    runningProcesses.delete(projectId);
    console.log(`   Removed from Map. Map size now: ${runningProcesses.size}`);
  });

  // Handle errors
  childProcess.on('error', (error) => {
    console.error(`❌ Process ${projectId} error:`, error);
    emitter.emit('error', error);
    runningProcesses.delete(projectId);
  });

  // Handle close event (different from exit)
  childProcess.on('close', (code, signal) => {
    console.log(`🔒 Process ${projectId} closed (code: ${code}, signal: ${signal})`);
  });

  // Handle disconnect
  childProcess.on('disconnect', () => {
    console.log(`🔌 Process ${projectId} disconnected`);
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
  console.log(`✅ Stored process in Map. Map size now: ${runningProcesses.size}`);

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
  const info = runningProcesses.get(projectId);
  console.log(`🔍 getProcessInfo(${projectId}):`, !!info);
  console.log(`   Map size: ${runningProcesses.size}`);
  console.log(`   Map keys:`, Array.from(runningProcesses.keys()));
  return info;
}

export function getAllProcesses(): Map<string, DevServerProcess> {
  console.log(`📋 getAllProcesses: ${runningProcesses.size} processes`);
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
