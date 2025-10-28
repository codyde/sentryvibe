import { createConnection } from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';

const execAsync = promisify(exec);

/**
 * Check if a port is actually available (not in use) on the system
 * @param port Port to check
 * @param host Host to check (default: 'localhost')
 * @returns Promise<boolean> - true if available (not in use), false if occupied
 */
export async function isPortAvailable(port: number, host: string = 'localhost'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });

    const cleanup = () => {
      socket.destroy();
    };

    const timeout = setTimeout(() => {
      cleanup();
      // Timeout means port is not listening - AVAILABLE
      resolve(true);
    }, 500);

    socket.on('connect', () => {
      // Successfully connected means something is listening - NOT AVAILABLE
      clearTimeout(timeout);
      cleanup();
      resolve(false);
    });

    socket.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      cleanup();
      // Connection refused means nothing listening - AVAILABLE
      // Other errors we'll treat as available too
      resolve(true);
    });
  });
}

/**
 * Find processes using a specific port
 * @param port Port to check
 * @returns Promise<number[]> - Array of PIDs using the port
 */
export async function findProcessesOnPort(port: number): Promise<number[]> {
  const isWindows = platform() === 'win32';
  const pids: number[] = [];

  try {
    if (isWindows) {
      // Windows: use netstat
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      const lines = stdout.trim().split('\n');
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(Number(pid))) {
          pids.push(Number(pid));
        }
      }
    } else {
      // Unix: use lsof
      const { stdout } = await execAsync(`lsof -ti:${port}`);
      const lines = stdout.trim().split('\n').filter(Boolean);
      
      for (const pid of lines) {
        if (pid && !isNaN(Number(pid))) {
          pids.push(Number(pid));
        }
      }
    }
  } catch (error) {
    // No process found on port or command failed - return empty array
  }

  return pids;
}

/**
 * Kill all processes on a specific port
 * @param port Port to free
 * @returns Promise<boolean> - true if any processes were killed
 */
export async function killProcessesOnPort(port: number): Promise<boolean> {
  const pids = await findProcessesOnPort(port);
  
  if (pids.length === 0) {
    return false;
  }

  console.log(`🔪 Found ${pids.length} process(es) on port ${port}: ${pids.join(', ')}`);

  const isWindows = platform() === 'win32';
  let killedAny = false;

  for (const pid of pids) {
    try {
      if (isWindows) {
        await execAsync(`taskkill /PID ${pid} /F /T`);
      } else {
        // Try SIGTERM first
        try {
          process.kill(pid, 'SIGTERM');
          // Wait a bit
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Check if still alive, force kill if needed
          try {
            process.kill(pid, 0); // Check if exists
            process.kill(pid, 'SIGKILL'); // Still alive, force kill
          } catch {
            // Already dead, that's fine
          }
        } catch {
          // Process might be owned by someone else, try pkill
          try {
            await execAsync(`kill -9 ${pid}`);
          } catch {
            // Best effort
          }
        }
      }
      
      console.log(`  ✅ Killed process ${pid}`);
      killedAny = true;
    } catch (error) {
      console.error(`  ❌ Failed to kill process ${pid}:`, error);
    }
  }

  return killedAny;
}

/**
 * Wait for a port to become available (with timeout)
 * @param port Port to wait for
 * @param maxRetries Maximum attempts
 * @param delayMs Delay between attempts
 * @returns Promise<boolean> - true if port became available
 */
export async function waitForPortAvailable(
  port: number,
  maxRetries: number = 10,
  delayMs: number = 500
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (await isPortAvailable(port)) {
      return true;
    }

    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return false;
}

/**
 * Find next available port in a range
 * @param startPort Starting port
 * @param endPort Ending port
 * @returns Promise<number | null> - Available port or null if none found
 */
export async function findAvailablePort(startPort: number, endPort: number): Promise<number | null> {
  for (let port = startPort; port <= endPort; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  return null;
}

