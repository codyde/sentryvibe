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
import { errors } from '../utils/cli-error.js';
import { ServiceManager } from '../ui/service-manager.js';
import { Dashboard } from '../ui/Dashboard.js';
import { ConsoleInterceptor } from '../ui/console-interceptor.js';

interface StartOptions {
  port?: string;
  brokerPort?: string;
  noTui?: boolean; // Disable TUI, use traditional logs
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
    const { startCommand: traditionalStart } = await import('./start.js');
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

  // Step 3: Check database
  if (!config.databaseUrl) {
    throw errors.monorepoNotFound([]);
  }

  // Step 4: Clean up zombie processes
  const webPort = Number(options.port || '3000');
  const brokerPort = Number(options.brokerPort || '4000');

  s.start('Checking for port conflicts');
  await killProcessOnPort(webPort);
  await killProcessOnPort(brokerPort);
  s.stop(pc.green('✓') + ' Ports available');

  // Clear screen for clean TUI start
  console.clear();

  // Show starting message (banner will be part of TUI)
  console.log();
  console.log(pc.bold('Starting TUI Dashboard...'));
  console.log(pc.dim('Press Ctrl+C or q to quit'));
  console.log();

  // Small delay to let user read the message
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Step 5: Create ServiceManager and Console Interceptor
  const serviceManager = new ServiceManager();
  const consoleInterceptor = new ConsoleInterceptor(serviceManager);
  const sharedSecret = config.broker?.secret || 'dev-secret';

  // Start intercepting console output BEFORE starting any services
  consoleInterceptor.start();

  // Register web app
  serviceManager.register({
    name: 'web',
    displayName: 'Web App',
    port: webPort,
    command: 'pnpm',
    args: ['--filter', 'sentryvibe', 'dev'],
    cwd: monorepoRoot,
    env: {
      PORT: String(webPort),
      DATABASE_URL: config.databaseUrl!,
      RUNNER_SHARED_SECRET: sharedSecret,
      RUNNER_BROKER_URL: `ws://localhost:${brokerPort}/socket`,
      RUNNER_BROKER_HTTP_URL: `http://localhost:${brokerPort}`,
      WORKSPACE_ROOT: config.workspace,
      RUNNER_ID: config.runner?.id || 'local',
      RUNNER_DEFAULT_ID: config.runner?.id || 'local',
    },
  });

  // Register broker
  serviceManager.register({
    name: 'broker',
    displayName: 'Broker',
    port: brokerPort,
    command: 'pnpm',
    args: ['--filter', 'sentryvibe-broker', 'dev'],
    cwd: monorepoRoot,
    env: {
      PORT: String(brokerPort),
      BROKER_PORT: String(brokerPort),
      RUNNER_SHARED_SECRET: sharedSecret,
      RUNNER_EVENT_TARGET_URL: `http://localhost:${webPort}`,
    },
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

  // Step 6: Render TUI
  const { waitUntilExit, clear } = render(
    React.createElement(Dashboard, {
      serviceManager,
      apiUrl: `http://localhost:${webPort}`,
      webPort
    })
  );

  // Step 7: Start services
  try {
    // Start web and broker (runner will be started separately)
    await serviceManager.start('web');
    await new Promise(resolve => setTimeout(resolve, 2000));

    await serviceManager.start('broker');
    await new Promise(resolve => setTimeout(resolve, 2000));

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

    // Start runner in background (non-blocking for TUI)
    const runnerPromise = startRunner({
      brokerUrl: `ws://localhost:${brokerPort}/socket`,
      sharedSecret: sharedSecret,
      runnerId: config.runner?.id || 'local',
      workspace: config.workspace,
      silent: true, // Suppress console output in TUI mode
    });

    // Wait for TUI to exit
    await waitUntilExit();

    // Stop console interception and restore normal console
    consoleInterceptor.stop();

    // Clear TUI immediately
    clear();

    // Show shutdown message
    console.log();
    console.log(pc.yellow('⚠'), 'Stopping all services...');

    // Stop all services with timeout
    const shutdownPromise = Promise.race([
      (async () => {
        // Close any active tunnels first (give it 1s)
        await serviceManager.closeTunnel('web').catch(() => {});

        // Then stop services
        await serviceManager.stopAll();
        // Runner will handle its own shutdown via SIGINT handler
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
    throw error;
  }
}
