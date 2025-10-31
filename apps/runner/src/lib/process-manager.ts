import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import { createServer } from 'net';

// Silent mode for TUI
let isSilentMode = false;

export function setSilentMode(silent: boolean): void {
  isSilentMode = silent;
}

/**
 * Process lifecycle states
 */
export enum ProcessState {
  IDLE = 'idle',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  FAILED = 'failed'
}

/**
 * Failure reason classification
 */
export enum FailureReason {
  PORT_IN_USE = 'port_in_use',
  COMMAND_NOT_FOUND = 'command_not_found',
  DIRECTORY_MISSING = 'directory_missing',
  PERMISSION_DENIED = 'permission_denied',
  IMMEDIATE_CRASH = 'immediate_crash',
  HEALTH_CHECK_TIMEOUT = 'health_check_timeout',
  HEALTH_CHECK_FAILED = 'health_check_failed',
  UNKNOWN = 'unknown'
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
  port?: number;
}

interface DevServerProcess {
  projectId: string;
  process: ChildProcess;
  emitter: EventEmitter;
  port?: number;
  tunnelUrl?: string;
  state: ProcessState;
  command: string;
  cwd: string;
  startedAt: Date;
  lastHealthCheck?: Date;
  stopReason?: string;
  failureReason?: FailureReason;
}

const activeProcesses = new Map<string, DevServerProcess>();

/**
 * Check if a port is in use (listening)
 */
async function checkPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true); // Port is in use
      } else {
        resolve(false);
      }
    });
    
    server.once('listening', () => {
      server.close();
      resolve(false); // Port is free
    });
    
    server.listen(port);
  });
}

/**
 * Verify server health after start
 * @param port - Port to check
 * @param maxAttempts - Maximum number of health check attempts (default: 30)
 * @returns Health check result
 */
async function verifyServerHealth(port: number, maxAttempts = 30): Promise<{
  healthy: boolean;
  error?: string;
}> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Check if port is listening
      const isListening = await checkPortInUse(port);
      
      if (!isListening) {
        // Port is still free, server hasn't started yet
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      
      // Port is listening, try HTTP request to verify it's responding
      try {
        const response = await fetch(`http://localhost:${port}`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(2000)
        });
        
        if (!isSilentMode) {
          console.log(`[process-manager] ✅ Health check passed for port ${port}`);
        }
        return { healthy: true };
      } catch (fetchError) {
        // Server is listening but not responding to HTTP yet
        // This is OK for some frameworks that take time to be ready
        if (!isSilentMode) {
          console.log(`[process-manager] Port ${port} listening but not responding yet (attempt ${i + 1}/${maxAttempts})`);
        }
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
    } catch (error) {
      return { 
        healthy: false, 
        error: `Health check failed: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }
  
  return { 
    healthy: false, 
    error: `Server failed to become healthy within ${maxAttempts} seconds` 
  };
}

/**
 * Classify startup error to provide better error messages
 */
function classifyStartupError(error: unknown, processInfo: Partial<DevServerProcess>): {
  reason: FailureReason;
  message: string;
  suggestion: string;
} {
  const errorStr = String(error);
  
  if (errorStr.includes('EADDRINUSE')) {
    return {
      reason: FailureReason.PORT_IN_USE,
      message: `Port ${processInfo.port} is already in use`,
      suggestion: 'Another process is using this port. Stop it or the system will reallocate.'
    };
  }
  
  if (errorStr.includes('ENOENT') || errorStr.includes('command not found')) {
    return {
      reason: FailureReason.COMMAND_NOT_FOUND,
      message: `Command not found: ${processInfo.command}`,
      suggestion: 'Check that dependencies are installed (npm install, pnpm install, etc.)'
    };
  }
  
  if (errorStr.includes('EACCES') || errorStr.includes('permission denied')) {
    return {
      reason: FailureReason.PERMISSION_DENIED,
      message: 'Permission denied',
      suggestion: 'Check file permissions and ownership'
    };
  }
  
  if (processInfo.cwd && !existsSync(processInfo.cwd)) {
    return {
      reason: FailureReason.DIRECTORY_MISSING,
      message: `Working directory does not exist: ${processInfo.cwd}`,
      suggestion: 'Project may have been deleted or moved'
    };
  }
  
  // If process exited within 3 seconds of starting
  if (processInfo.startedAt && Date.now() - processInfo.startedAt.getTime() < 3000) {
    return {
      reason: FailureReason.IMMEDIATE_CRASH,
      message: 'Process crashed immediately after starting',
      suggestion: 'Check logs for syntax errors or missing dependencies'
    };
  }
  
  return {
    reason: FailureReason.UNKNOWN,
    message: errorStr,
    suggestion: 'Check the logs for more details'
  };
}

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
    return {
      projectId,
      process: null as any,
      emitter,
      port: options.port,
      state: ProcessState.FAILED,
      command,
      cwd,
      startedAt: new Date(),
      failureReason: FailureReason.DIRECTORY_MISSING,
    };
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
    projectId,
    process: childProcess,
    emitter,
    port: options.port,
    state: ProcessState.STARTING,
    command,
    cwd,
    startedAt: new Date(),
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

  // Handle stdout - just forward logs (port is pre-allocated by API)
  childProcess.stdout?.on('data', (data: Buffer) => {
    const text = data.toString();
    emitter.emit('log', { type: 'stdout', data: text });
  });

  // Handle stderr
  childProcess.stderr?.on('data', (data: Buffer) => {
    emitter.emit('log', { type: 'stderr', data: data.toString() });
  });

  // Handle exit
  childProcess.on('exit', (code, signal) => {
    // Update state based on exit
    if (code === 0 || devProcess.state === ProcessState.STOPPING) {
      devProcess.state = ProcessState.STOPPED;
    } else {
      devProcess.state = ProcessState.FAILED;
      
      // Classify the failure
      const classification = classifyStartupError(
        new Error(`Process exited with code ${code}, signal ${signal}`),
        devProcess
      );
      devProcess.failureReason = classification.reason;
      
      if (!isSilentMode) {
        console.error(`[process-manager] ❌ ${classification.message}`);
        console.error(`[process-manager]    Suggestion: ${classification.suggestion}`);
      }
    }
    
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
    devProcess.state = ProcessState.FAILED;
    
    // Classify the error
    const classification = classifyStartupError(error, devProcess);
    devProcess.failureReason = classification.reason;
    
    console.error(`[process-manager] ❌ Process error for ${projectId}: ${classification.message}`);
    console.error(`[process-manager]    Suggestion: ${classification.suggestion}`);
    
    emitter.emit('error', error);
  });

  return devProcess;
}

/**
 * Stop a development server for a project with graceful shutdown
 * @param projectId - The project ID to stop
 * @param options - Shutdown options
 * @returns Promise<boolean> - true if stopped, false if no process found
 */
export async function stopDevServer(
  projectId: string,
  options?: {
    timeout?: number;
    reason?: string;
    tunnelManager?: any; // TunnelManager instance
    port?: number;
  }
): Promise<boolean> {
  const { timeout = 10000, reason = 'manual', tunnelManager, port } = options || {};
  
  const devProcess = activeProcesses.get(projectId);
  if (!devProcess) {
    return false;
  }

  if (!isSilentMode) {
    console.log(`[process-manager] Stopping dev server for ${projectId} (reason: ${reason})`);
  }

  // Update state to STOPPING
  devProcess.state = ProcessState.STOPPING;
  devProcess.stopReason = reason;

  // Step 1: Close tunnel first (if tunnelManager and port provided)
  const tunnelPort = port || devProcess.port;
  if (tunnelManager && tunnelPort) {
    try {
      if (!isSilentMode) console.log(`[process-manager] Closing tunnel for port ${tunnelPort}...`);
      await tunnelManager.closeTunnel(tunnelPort);
      devProcess.tunnelUrl = undefined;
    } catch (error) {
      console.error(`[process-manager] Failed to close tunnel:`, error);
      // Continue anyway - we still need to stop the process
    }
  }

  // Step 2: Send SIGTERM for graceful shutdown
  if (!isSilentMode) console.log(`[process-manager] Sending SIGTERM to PID ${devProcess.process.pid}`);
  devProcess.process.kill('SIGTERM');

  // Step 3: Wait for exit with timeout
  const exitPromise = new Promise<void>((resolve) => {
    devProcess.emitter.once('exit', () => resolve());
  });

  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => resolve(), timeout);
  });

  await Promise.race([exitPromise, timeoutPromise]);

  // Step 4: Force kill if still running
  if (devProcess.process.exitCode === null && !devProcess.process.killed) {
    console.warn(`[process-manager] Process ${projectId} didn't exit gracefully, sending SIGKILL`);
    devProcess.process.kill('SIGKILL');
    // Wait a bit for SIGKILL to take effect
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Step 5: Cleanup
  activeProcesses.delete(projectId);
  
  if (!isSilentMode) console.log(`[process-manager] ✅ Stopped dev server for ${projectId}`);
  
  return true;
}

/**
 * Run health check on a dev server and update state
 * @param projectId - Project ID to health check
 * @param port - Port to check
 * @returns Health check result
 */
export async function runHealthCheck(projectId: string, port: number): Promise<{
  healthy: boolean;
  error?: string;
}> {
  const devProcess = activeProcesses.get(projectId);
  if (!devProcess) {
    return { healthy: false, error: 'Process not found' };
  }

  const result = await verifyServerHealth(port);
  
  if (result.healthy) {
    devProcess.state = ProcessState.RUNNING;
    devProcess.lastHealthCheck = new Date();
  } else {
    devProcess.state = ProcessState.FAILED;
    devProcess.failureReason = FailureReason.HEALTH_CHECK_FAILED;
  }
  
  return result;
}

/**
 * Get active process for a project
 */
export function getDevServer(projectId: string): DevServerProcess | undefined {
  return activeProcesses.get(projectId);
}

/**
 * Get all active project IDs
 */
export function getAllActiveProjectIds(): string[] {
  return Array.from(activeProcesses.keys());
}

/**
 * Stop all running dev servers
 */
export async function stopAllDevServers(tunnelManager?: any): Promise<void> {
  const projectIds = getAllActiveProjectIds();
  
  // Stop all processes in parallel
  await Promise.allSettled(
    projectIds.map(projectId => 
      stopDevServer(projectId, { 
        tunnelManager,
        reason: 'shutdown' 
      })
    )
  );
}

/**
 * Get process state for debugging/monitoring
 */
export function getProcessState(projectId: string): ProcessState | undefined {
  return activeProcesses.get(projectId)?.state;
}
