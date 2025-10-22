/**
 * Enhanced start command with graceful shutdown and better error handling
 * Starts the full stack: Web App + Broker + Runner
 */

import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { configManager } from '../utils/config-manager.js';
import { findMonorepoRoot, isInsideMonorepo } from '../utils/repo-detector.js';
import { killProcessOnPort } from '../utils/process-killer.js';
import { CLIError, errors } from '../utils/cli-error.js';
import { shutdownHandler } from '../index.js';

interface StartOptions {
  port?: string;
  brokerPort?: string;
  prod?: boolean; // Use production mode (build + start)
}

interface ManagedProcess {
  name: string;
  process: ChildProcess;
  port?: number;
}

export async function startCommand(options: StartOptions) {
  const s = p.spinner();

  // Step 1: Find monorepo
  s.start('Locating SentryVibe repository');

  let monorepoRoot: string | undefined;
  const config = configManager.get();

  // Try config first
  if (config.monorepoPath && existsSync(config.monorepoPath)) {
    monorepoRoot = config.monorepoPath;
  }

  // Try detection
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
    try {
      const { installDependencies } = await import('../utils/repo-cloner.js');
      await installDependencies(monorepoRoot);
      s.stop(pc.green('✓') + ' Dependencies installed');
    } catch (error) {
      s.stop(pc.red('✗') + ' Failed to install dependencies');
      throw new CLIError({
        code: 'DEPENDENCIES_INSTALL_FAILED',
        message: 'Failed to install dependencies',
        cause: error instanceof Error ? error : new Error(String(error)),
        suggestions: [
          `Run manually: cd ${monorepoRoot} && pnpm install`,
          'Check your internet connection',
        ],
      });
    }
  }

  // Step 2.5: Build for production mode
  if (options.prod) {
    s.start('Building services (production mode)');

    try {
      // Use turbo to build all services with caching
      await new Promise<void>((resolve, reject) => {
        const buildProcess = spawn('pnpm', ['build:all'], {
          cwd: monorepoRoot,
          stdio: 'inherit', // Show build output in traditional mode
          shell: true,
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

      s.stop(pc.green('✓') + ' Build complete (using Turborepo cache)');
    } catch (error) {
      s.stop(pc.red('✗') + ' Build failed');
      throw new CLIError({
        code: 'BUILD_FAILED',
        message: 'Failed to build services for production mode',
        suggestions: [
          'Check that all dependencies are installed',
          'Try running: pnpm build:all',
          'Run without --prod flag to use dev mode',
        ],
      });
    }
  }

  // Step 3: Check database
  if (!config.databaseUrl) {
    throw new CLIError({
      code: 'MISSING_REQUIRED_CONFIG',
      message: 'Database URL not configured',
      suggestions: [
        'Run initialization: sentryvibe init',
        'Or set manually: sentryvibe config set databaseUrl <url>',
        'Or setup database: sentryvibe db',
      ],
      docs: 'https://github.com/codyde/sentryvibe#database-setup',
    });
  }

  // Step 4: Clean up zombie processes
  const webPort = Number(options.port || '3000');
  const brokerPort = Number(options.brokerPort || '4000');

  s.start('Checking for port conflicts');
  await killProcessOnPort(webPort);
  await killProcessOnPort(brokerPort);
  s.stop(pc.green('✓') + ' Ports available');

  console.log();
  console.log(pc.bold('Starting services...'));
  console.log();

  const processes: ManagedProcess[] = [];
  const sharedSecret = config.broker?.secret || 'dev-secret';

  // Register cleanup with shutdown handler
  shutdownHandler.onShutdown(async () => {
    console.log();
    console.log(pc.yellow('⚠'), 'Stopping all services...');

    // Kill all child processes
    for (const { name, process: proc } of processes) {
      if (!proc.killed && proc.pid) {
        console.log(pc.dim(`  Stopping ${name}...`));
        proc.kill('SIGTERM');
      }
    }

    // Give them time to exit gracefully
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Force kill stragglers
    for (const { name, port } of processes) {
      if (port) {
        try {
          await killProcessOnPort(port);
        } catch {
          // Best effort
        }
      }
    }

    console.log(pc.green('✓'), 'All services stopped');
  });

  try {
    // Start Web App
    console.log(pc.cyan('1/3'), 'Starting web app...');
    const webCommand = options.prod ? 'start' : 'dev';
    const webApp = spawn('pnpm', ['--filter', 'sentryvibe', webCommand], {
      cwd: monorepoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: {
        ...process.env,
        PORT: String(webPort),
        DATABASE_URL: config.databaseUrl,
        RUNNER_SHARED_SECRET: sharedSecret,
        RUNNER_BROKER_URL: `ws://localhost:${brokerPort}/socket`,
        RUNNER_BROKER_HTTP_URL: `http://localhost:${brokerPort}`,
        WORKSPACE_ROOT: config.workspace,
        RUNNER_ID: config.runner?.id || 'local',
        RUNNER_DEFAULT_ID: config.runner?.id || 'local',
      },
    });

    processes.push({ name: 'Web App', process: webApp, port: webPort });
    shutdownHandler.registerProcess(webApp);

    // Handle web app output
    webApp.stdout?.on('data', (data) => {
      const text = data.toString().trim();
      if (text && !text.includes('warn') && !text.includes('deprecated')) {
        console.log(pc.blue('[web]'), text);
      }
    });

    webApp.stderr?.on('data', (data) => {
      const text = data.toString().trim();
      if (text && !text.includes('warn') && !text.includes('deprecated')) {
        console.log(pc.yellow('[web]'), text);
      }
    });

    webApp.on('exit', (code) => {
      // Exit codes 0, 130 (SIGINT), and 143 (SIGTERM) are normal shutdown
      if (code !== 0 && code !== null && code !== 130 && code !== 143) {
        console.error(pc.red('✗'), `Web app crashed with code ${code}`);
        process.exit(1);
      }
    });

    // Wait for web app to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start Broker
    console.log(pc.cyan('2/3'), 'Starting broker...');
    const brokerCommand = options.prod ? 'start' : 'dev';
    const broker = spawn('pnpm', ['--filter', 'sentryvibe-broker', brokerCommand], {
      cwd: monorepoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: {
        ...process.env,
        PORT: String(brokerPort),
        BROKER_PORT: String(brokerPort),
        RUNNER_SHARED_SECRET: sharedSecret,
        RUNNER_EVENT_TARGET_URL: `http://localhost:${webPort}`,
      },
    });

    processes.push({ name: 'Broker', process: broker, port: brokerPort });
    shutdownHandler.registerProcess(broker);

    // Handle broker output
    broker.stdout?.on('data', (data) => {
      const text = data.toString().trim();
      if (text) {
        console.log(pc.green('[broker]'), text);
      }
    });

    broker.stderr?.on('data', (data) => {
      const text = data.toString().trim();
      if (text && !text.includes('warn') && !text.includes('deprecated')) {
        console.log(pc.yellow('[broker]'), text);
      }
    });

    broker.on('exit', (code) => {
      // Exit codes 0, 130 (SIGINT), and 143 (SIGTERM) are normal shutdown
      if (code !== 0 && code !== null && code !== 130 && code !== 143) {
        console.error(pc.red('✗'), `Broker crashed with code ${code}`);
        process.exit(1);
      }
    });

    // Wait for broker to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start Runner
    console.log(pc.cyan('3/3'), 'Starting runner...');
    console.log();

    // Success message
    console.log(pc.green('✓'), pc.bold('All services started!'));
    console.log();
    console.log(pc.bold('Services running:'));
    console.log(`  ${pc.blue('Web App:')} http://localhost:${webPort}`);
    console.log(`  ${pc.green('Broker:')} http://localhost:${brokerPort}`);
    console.log(`  ${pc.magenta('Runner:')} Connected to broker`);
    console.log();
    console.log(pc.dim(`Press ${pc.cyan('Ctrl+C')} to stop all services`));
    console.log();

    // Start runner (blocks until shutdown)
    const { startRunner } = await import('../../index.js');
    await startRunner({
      brokerUrl: `ws://localhost:${brokerPort}/socket`,
      sharedSecret: sharedSecret,
      runnerId: config.runner?.id || 'local',
      workspace: config.workspace,
    });

  } catch (error) {
    // Global error handler will format this nicely
    throw error;
  }
}
