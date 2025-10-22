/**
 * Graceful shutdown handler for CLI
 * Ensures proper cleanup when user presses Ctrl+C or process is terminated
 */

import chalk from 'chalk';
import { ChildProcess } from 'child_process';

type CleanupFunction = () => Promise<void> | void;

export interface ShutdownHandlerOptions {
  /** Timeout in ms before forcing exit (default: 5000) */
  timeout?: number;
  /** Show shutdown messages (default: true) */
  verbose?: boolean;
}

export class ShutdownHandler {
  private cleanupFunctions: CleanupFunction[] = [];
  private childProcesses: ChildProcess[] = [];
  private isShuttingDown = false;
  private timeout: number;
  private verbose: boolean;

  constructor(options: ShutdownHandlerOptions = {}) {
    this.timeout = options.timeout ?? 5000;
    this.verbose = options.verbose !== false;
  }

  /**
   * Register a cleanup function to run on shutdown
   */
  onShutdown(fn: CleanupFunction): void {
    this.cleanupFunctions.push(fn);
  }

  /**
   * Register a child process to kill on shutdown
   */
  registerProcess(process: ChildProcess): void {
    this.childProcesses.push(process);
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  setup(): void {
    // Handle Ctrl+C (SIGINT)
    process.on('SIGINT', () => {
      if (this.verbose) {
        console.log(); // New line after ^C
        console.log(chalk.yellow('⚠'), 'Received interrupt signal (Ctrl+C)');
      }
      this.shutdown('SIGINT');
    });

    // Handle termination (SIGTERM)
    process.on('SIGTERM', () => {
      if (this.verbose) {
        console.log(chalk.yellow('⚠'), 'Received termination signal (SIGTERM)');
      }
      this.shutdown('SIGTERM');
    });

    // Handle process exit
    process.on('exit', (code) => {
      if (this.verbose && code !== 0) {
        console.log(chalk.red('✗'), `Process exiting with code ${code}`);
      }
    });
  }

  /**
   * Execute graceful shutdown
   */
  private async shutdown(signal: string): Promise<void> {
    // Prevent multiple shutdown attempts
    if (this.isShuttingDown) {
      if (this.verbose) {
        console.log(chalk.dim('  Already shutting down...'));
      }
      return;
    }

    this.isShuttingDown = true;

    if (this.verbose) {
      console.log(chalk.cyan('ℹ'), 'Shutting down gracefully...');
    }

    // Set a timeout to force exit if cleanup takes too long
    const forceExitTimeout = setTimeout(() => {
      console.error(chalk.red('✗'), 'Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, this.timeout);

    try {
      // 1. Kill child processes first
      if (this.childProcesses.length > 0) {
        if (this.verbose) {
          console.log(chalk.dim('  Stopping child processes...'));
        }
        await this.killChildProcesses();
      }

      // 2. Run cleanup functions
      if (this.cleanupFunctions.length > 0) {
        if (this.verbose) {
          console.log(chalk.dim('  Running cleanup tasks...'));
        }
        await this.runCleanup();
      }

      // 3. Success
      if (this.verbose) {
        console.log(chalk.green('✓'), 'Shutdown complete');
      }

      clearTimeout(forceExitTimeout);
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('✗'), 'Error during shutdown:', error);
      clearTimeout(forceExitTimeout);
      process.exit(1);
    }
  }

  /**
   * Kill all registered child processes
   */
  private async killChildProcesses(): Promise<void> {
    const killPromises = this.childProcesses.map(async (child) => {
      if (!child.killed && child.pid) {
        try {
          // Try graceful SIGTERM first
          child.kill('SIGTERM');

          // Wait up to 2 seconds for graceful shutdown
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              // Force kill if still alive
              if (!child.killed) {
                child.kill('SIGKILL');
              }
              resolve();
            }, 2000);

            child.on('exit', () => {
              clearTimeout(timeout);
              resolve();
            });
          });
        } catch (error) {
          // Process might already be dead
          if (this.verbose) {
            console.log(chalk.dim(`  Could not kill process ${child.pid}`));
          }
        }
      }
    });

    await Promise.all(killPromises);
  }

  /**
   * Run all cleanup functions
   */
  private async runCleanup(): Promise<void> {
    const cleanupPromises = this.cleanupFunctions.map(async (fn) => {
      try {
        await fn();
      } catch (error) {
        if (this.verbose) {
          console.error(chalk.yellow('⚠'), 'Cleanup function failed:', error);
        }
      }
    });

    await Promise.all(cleanupPromises);
  }

  /**
   * Manually trigger shutdown (for testing or programmatic use)
   */
  async triggerShutdown(): Promise<void> {
    await this.shutdown('MANUAL');
  }

  /**
   * Remove a child process from tracking (e.g., after it exits naturally)
   */
  unregisterProcess(process: ChildProcess): void {
    const index = this.childProcesses.indexOf(process);
    if (index > -1) {
      this.childProcesses.splice(index, 1);
    }
  }
}

/**
 * Global shutdown handler instance
 */
export const globalShutdownHandler = new ShutdownHandler();

/**
 * Helper to setup shutdown handler with common options
 */
export function setupShutdownHandler(options?: ShutdownHandlerOptions): ShutdownHandler {
  const handler = new ShutdownHandler(options);
  handler.setup();
  return handler;
}
