// This file is used for Next.js instrumentation
// It runs once when the server starts
import { cleanupOrphanedProcesses } from './src/lib/startup-cleanup';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Handle EPIPE errors gracefully on stdout/stderr
    // This prevents crashes when the parent process closes the output streams
    if (process.stdout) {
      process.stdout.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE') {
          // Silently ignore EPIPE errors - this is expected when stdout is closed
          return;
        }
        // Re-throw other errors
        throw err;
      });
    }

    if (process.stderr) {
      process.stderr.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE') {
          // Silently ignore EPIPE errors - this is expected when stderr is closed
          return;
        }
        // Re-throw other errors
        throw err;
      });
    }

    // Handle uncaught EPIPE exceptions
    // This catches EPIPE errors that bubble up from console.log/error calls
    process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE') {
        // Silently ignore EPIPE errors - this is Node.js's default behavior
        // that gets disrupted by console wrapping from instrumentation
        return;
      }
      // Re-throw all other uncaught exceptions
      throw err;
    });

    // Run cleanup on server startup
    await cleanupOrphanedProcesses();
  }
}
