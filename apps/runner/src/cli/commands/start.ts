/**
 * Start command with TUI dashboard support
 * Provides beautiful real-time monitoring of all services
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { render } from 'ink';
import React from 'react';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { configManager } from '../utils/config-manager.js';
import { isInsideMonorepo } from '../utils/repo-detector.js';
import { killProcessOnPort } from '../utils/process-killer.js';
import { CLIError, errors } from '../utils/cli-error.js';
import { ServiceManager } from '../ui/service-manager.js';
import { Dashboard } from '../ui/Dashboard.js';
import { ConsoleInterceptor } from '../ui/console-interceptor.js';
import { LogFileManager } from '../ui/log-file-manager.js';

interface StartOptions {
  port?: string;
  noTui?: boolean; // Disable TUI, use traditional logs
  dev?: boolean; // Use development mode (hot reload)
  rebuild?: boolean; // Rebuild services before starting
}

/**
 * Check if we should use TUI
 */
function shouldUseTUI(options: StartOptions): boolean {
  // Explicit flag
  if (options.noTui) return false;

  // CI/CD environments
  if (process.env.CI === '1' || process.env.CI === 'true') return false;

  // Not a TTY
  if (!process.stdout.isTTY) return false;

  // Explicit env var to disable
  if (process.env.NO_TUI === '1') return false;

  return true;
}

export async function startCommand(options: StartOptions) {
  const useTUI = shouldUseTUI(options);

  // If TUI is disabled, use the traditional start command
  if (!useTUI) {
    const { startCommand: traditionalStart } = await import('./start-traditional.js');
    return traditionalStart(options);
  }

  // ========================================
  // TUI MODE
  // ========================================

  const s = p.spinner();

  // Step 1: Find monorepo
  s.start('Locating SentryVibe repository');

  let monorepoRoot: string | undefined;
  const config = configManager.get();

  if (config.monorepoPath && existsSync(config.monorepoPath)) {
    monorepoRoot = config.monorepoPath;
  }

  if (!monorepoRoot) {
    const repoCheck = await isInsideMonorepo();
    if (repoCheck.inside && repoCheck.root) {
      monorepoRoot = repoCheck.root;
      configManager.set('monorepoPath', monorepoRoot);
    }
  }

  if (!monorepoRoot) {
    s.stop(pc.red('✗') + ' Repository not found');
    throw errors.monorepoNotFound([
      config.monorepoPath || 'none',
      process.cwd(),
    ]);
  }

  s.stop(pc.green('✓') + ' Repository found');

  // Step 2: Check dependencies
  const nodeModulesPath = join(monorepoRoot, 'node_modules');

  if (!existsSync(nodeModulesPath)) {
    s.start('Installing dependencies');
    const { installDependencies } = await import('../utils/repo-cloner.js');
    await installDependencies(monorepoRoot);
    s.stop(pc.green('✓') + ' Dependencies installed');
  }

  // Step 2.5: Rebuild services if requested
  if (options.rebuild) {
    s.start('Rebuilding services');
    const { spawn } = await import('child_process');

    try {
      // Use turbo to build all services with caching
      await new Promise<void>((resolve, reject) => {
        const buildProcess = spawn('pnpm', ['build:all'], {
          cwd: monorepoRoot,
          stdio: 'pipe', // Capture output silently
        });

        buildProcess.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Build failed with code ${code}`));
          }
        });

        buildProcess.on('error', reject);
      });

      s.stop(pc.green('✓') + ' Rebuild complete (using Turborepo cache)');
    } catch (error) {
      s.stop(pc.red('✗') + ' Build failed');
      throw new CLIError({
        code: 'BUILD_FAILED',
        message: 'Failed to rebuild services',
        suggestions: [
          'Check that all dependencies are installed',
          'Try running: pnpm build:all',
          'Run with --dev flag to skip build and use dev mode',
        ],
      });
    }
  }

  // Step 3: Check database configuration
  const databaseMode = config.databaseMode || 'pglite'; // Default to local if not set
  
  // For postgres mode, require DATABASE_URL
  if (databaseMode === 'postgres' && !config.databaseUrl) {
    throw new CLIError({
      code: 'MISSING_REQUIRED_CONFIG',
      message: 'Database URL not configured for PostgreSQL mode',
      suggestions: [
        'Run initialization: sentryvibe init',
        'Or set manually: sentryvibe config set databaseUrl <url>',
        'Or use local database: sentryvibe config set databaseMode pglite',
      ],
      docs: 'https://github.com/codyde/sentryvibe#database-setup',
    });
  }

  // Step 4: Clean up zombie processes
  const webPort = Number(options.port || '3000');

  s.start('Checking for port conflicts');
  await killProcessOnPort(webPort);
  s.stop(pc.green('✓') + ' Ports available');

  // Step 5: Create ServiceManager, LogFileManager, and Console Interceptor FIRST
  const serviceManager = new ServiceManager();
  const logFileManager = new LogFileManager();
  logFileManager.start(); // Start log file writing immediately
  const consoleInterceptor = new ConsoleInterceptor(serviceManager, logFileManager);

  // Start intercepting IMMEDIATELY before anything else can print
  consoleInterceptor.start();

  const sharedSecret = configManager.getSecret() || 'dev-secret';

  // Hook up service manager output to log file (for child process logs)
  serviceManager.on('service:output', (name, output, stream) => {
    logFileManager.write(name, output.trim(), stream);
  });

  // Keep silent mode for TUI, logs go to file
  process.env.SILENT_MODE = '1';

  // Clear screen for clean TUI start
  console.clear();

  // Register web app (now handles runner WebSocket connections directly)
  // Default to production mode unless --dev flag is present
  const webCommand = options.dev ? 'dev' : 'start';
  // Build environment variables for the web app
  const webEnv: Record<string, string> = {
    PORT: String(webPort),
    RUNNER_SHARED_SECRET: sharedSecret,
    WORKSPACE_ROOT: config.workspace,
    RUNNER_ID: config.runner?.id || 'local',
    RUNNER_DEFAULT_ID: config.runner?.id || 'local',
    DATABASE_MODE: databaseMode,
  };
  
  // Add DATABASE_URL only for postgres mode
  if (databaseMode === 'postgres' && config.databaseUrl) {
    webEnv.DATABASE_URL = config.databaseUrl;
  }
  
  serviceManager.register({
    name: 'web',
    displayName: 'Web App',
    port: webPort,
    command: 'pnpm',
    args: ['--filter', 'sentryvibe', webCommand],
    cwd: monorepoRoot,
    env: webEnv,
  });

  // Register runner (special handling - not spawned, imported directly)
  serviceManager.register({
    name: 'runner',
    displayName: 'Runner',
    command: 'internal', // Not actually spawned
    args: [],
    cwd: monorepoRoot,
    env: {},
  });

  // Step 6: Clear screen and move cursor to home before TUI renders
  // Use ANSI codes that will pass through our interceptor
  process.stdout.write('\x1b[2J\x1b[H'); // Clear screen + move cursor to top-left

  // Ensure stdin is in raw mode for keyboard input
  if (process.stdin.setRawMode) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();

  // Track runner cleanup function and shutting down state
  let isShuttingDown = false;
  let runnerCleanupFn: (() => Promise<void>) | undefined;

  // Add backup SIGINT handler for Ctrl+C (in case Ink's doesn't fire)
  const handleSigInt = async () => {
    if (isShuttingDown) {
      // Force exit if already shutting down
      process.exit(1);
    }
    isShuttingDown = true;

    console.log('\n⚠ Received Ctrl+C, stopping services...');

    // Stop runner first if cleanup function exists
    if (runnerCleanupFn) {
      await runnerCleanupFn().catch(() => {});
    }

    // Then stop other services
    await serviceManager.stopAll().catch(() => {});
    consoleInterceptor.stop();
    process.exit(0);
  };

  process.on('SIGINT', handleSigInt);

  // One final clear right before rendering
  process.stdout.write('\x1b[2J\x1b[H');

  // Enable alternate screen buffer to prevent scrolling above TUI
  process.stdout.write('\x1b[?1049h'); // Enter alternate screen
  process.stdout.write('\x1b[2J\x1b[H'); // Clear and home

  // Render TUI immediately with log file path
  const { waitUntilExit, clear } = render(
    React.createElement(Dashboard, {
      serviceManager,
      apiUrl: `http://localhost:${webPort}`,
      webPort,
      logFilePath: consoleInterceptor.getLogFilePath()
    }),
    {
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      exitOnCtrlC: true,
      patchConsole: false // Don't let Ink patch console since we already intercept
    }
  );

  // Step 7: Start services
  try {
    // Start web app (runner will be started separately)
    await serviceManager.start('web');
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for WebSocket server to initialize

    // Mark runner as starting
    const runnerService = serviceManager['services'].get('runner');
    if (runnerService) {
      runnerService.state.status = 'starting';
      runnerService.startTime = Date.now();
      serviceManager.emit('service:status-change', 'runner', 'starting');
    }

    // Start runner directly (this blocks until shutdown)
    const { startRunner } = await import('../../index.js');

    // Mark as running
    if (runnerService) {
      runnerService.state.status = 'running';
      serviceManager.emit('service:status-change', 'runner', 'running');
    }

    // Start runner and get cleanup function - connects directly to Next.js WebSocket
    runnerCleanupFn = await startRunner({
      wsUrl: `ws://localhost:${webPort}/ws/runner`,
      sharedSecret: sharedSecret,
      runnerId: config.runner?.id || 'local',
      workspace: config.workspace,
      silent: false, // Changed to false - show all logs
    });

    // Wait for TUI to exit
    await waitUntilExit();

    // Stop console interception and restore normal console
    consoleInterceptor.stop();

    // Clear TUI immediately
    clear();

    // Exit alternate screen buffer
    process.stdout.write('\x1b[?1049l');

    // Show shutdown message
    console.log();
    console.log(pc.yellow('⚠'), 'Stopping all services...');

    // Stop all services with timeout
    const shutdownPromise = Promise.race([
      (async () => {
        // Close any active tunnels first (give it 1s)
        await serviceManager.closeTunnel('web').catch(() => {});

        // Stop spawned services (web, broker)
        await serviceManager.stopAll();
        console.log(pc.green('✓'), 'Services stopped');

        // Stop runner explicitly using cleanup function
        if (runnerCleanupFn) {
          console.log(pc.yellow('⚠'), 'Stopping runner...');
          await runnerCleanupFn();
          console.log(pc.green('✓'), 'Runner stopped');
        }

        console.log(pc.green('✓'), 'All services stopped');
      })(),
      new Promise((resolve) => setTimeout(() => {
        console.log(pc.yellow('⚠'), 'Shutdown timeout - forcing exit');
        resolve(undefined);
      }, 5000)) // Increased from 3s to 5s to allow tunnel cleanup
    ]);

    await shutdownPromise;

    // Force exit to ensure we return to prompt
    process.exit(0);
  } catch (error) {
    // Stop console interception on error
    consoleInterceptor.stop();
    clear();
    // Exit alternate screen buffer
    process.stdout.write('\x1b[?1049l');
    throw error;
  }
}
