import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:os';

const execAsync = promisify(exec);

/**
 * Kill a process and all its children
 * Works on macOS and Linux
 */
export async function killProcessTree(pid: number, signal: string = 'SIGTERM'): Promise<void> {
  if (!pid || pid <= 0) {
    return;
  }

  const isWindows = platform() === 'win32';

  try {
    if (isWindows) {
      // Windows - use taskkill
      await execAsync(`taskkill /pid ${pid} /T /F`);
    } else {
      // Unix (macOS/Linux) - kill process group
      // Using negative PID kills the entire process group
      try {
        process.kill(-pid, signal);
      } catch (error) {
        // If that fails, try killing just the PID
        try {
          process.kill(pid, signal);
        } catch {
          // Process might already be dead
        }

        // Also try pkill as fallback
        try {
          await execAsync(`pkill -P ${pid}`);
        } catch {
          // Best effort
        }
      }
    }
  } catch (error) {
    // Process might already be dead, that's fine
  }
}

/**
 * Kill process by port number
 * Useful for cleaning up zombie processes
 */
export async function killProcessOnPort(port: number): Promise<boolean> {
  const isWindows = platform() === 'win32';

  try {
    if (isWindows) {
      // Windows
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(Number(pid))) {
          await execAsync(`taskkill /PID ${pid} /F`);
        }
      }
    } else {
      // Unix - use lsof and kill
      const { stdout } = await execAsync(`lsof -ti:${port}`);
      const pids = stdout.trim().split('\n').filter(Boolean);

      for (const pid of pids) {
        if (pid && !isNaN(Number(pid))) {
          await killProcessTree(Number(pid), 'SIGKILL');
        }
      }
    }
    return true;
  } catch (error) {
    // No process found on port or already dead
    return false;
  }
}
