import { spawn, ChildProcess } from 'child_process';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { configManager } from '../utils/config-manager.js';
import { findMonorepoRoot, isInsideMonorepo } from '../utils/repo-detector.js';
import { killProcessTree, killProcessOnPort } from '../utils/process-killer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface StartOptions {
  port?: string;
  brokerPort?: string;
}

interface ManagedProcess {
  name: string;
  process: ChildProcess;
  port?: number;
}

export async function startCommand(options: StartOptions) {
  logger.section('Starting SentryVibe Full Stack');
  logger.log('');

  // Step 1: Find the monorepo root
  let monorepoRoot: string | undefined;

  // Check saved config first
  const config = configManager.get();
  if (config.monorepoPath) {
    logger.info('Using monorepo path from config...');
    monorepoRoot = config.monorepoPath;
  }

  // If not in config, try to detect from current location
  if (!monorepoRoot) {
    logger.info('Detecting monorepo location...');
    const repoCheck = await isInsideMonorepo();
    if (repoCheck.inside) {
      monorepoRoot = repoCheck.root;
      // Save it for next time
      configManager.set('monorepoPath', monorepoRoot);
    }
  }

  // If still not found, try going up from CLI location
  if (!monorepoRoot) {
    const detected = await findMonorepoRoot(join(__dirname, '../../../../..'));
    monorepoRoot = detected || undefined;
  }

  // If we still can't find it, error out
  if (!monorepoRoot) {
    logger.error('Could not find SentryVibe repository');
    logger.log('');
    logger.info('Please run one of the following:');
    logger.log(`  1. ${chalk.cyan('sentryvibe init')} - To clone and set up the repository`);
    logger.log(`  2. Navigate to the repository and run ${chalk.cyan('sentryvibe run')} again`);
    logger.log('');
    process.exit(1);
  }

  logger.info(`Monorepo root: ${chalk.cyan(monorepoRoot)}`);
  logger.info(`Web app port: ${chalk.cyan(options.port || '3000')}`);
  logger.info(`Broker port: ${chalk.cyan(options.brokerPort || '4000')}`);
  logger.log('');

  // Check if dependencies are installed
  const { existsSync } = await import('fs');
  const nodeModulesPath = join(monorepoRoot, 'node_modules');
  const agentCoreDistPath = join(monorepoRoot, 'packages/agent-core/dist');

  if (!existsSync(nodeModulesPath)) {
    logger.warn('Dependencies not installed');
    logger.info('Installing dependencies...');
    logger.log('');

    const { installDependencies } = await import('../utils/repo-cloner.js');
    await installDependencies(monorepoRoot);

    logger.log('');
  }

  // Check if agent-core is built
  if (!existsSync(agentCoreDistPath)) {
    logger.warn('agent-core package not built');
    logger.info('Building agent-core...');
    logger.log('');

    const { buildAgentCore } = await import('../utils/repo-cloner.js');
    await buildAgentCore(monorepoRoot);

    logger.log('');
  }

  // Get ports
  const webPort = options.port || '3000';
  const brokerPort = options.brokerPort || '4000';

  // Clean up any zombie processes on these ports before starting
  logger.info('Checking for processes on ports...');
  await killProcessOnPort(Number(webPort));
  await killProcessOnPort(Number(brokerPort));

  const processes: ManagedProcess[] = [];

  // Handle cleanup on exit
  const cleanup = async (exitCode: number = 0) => {
    logger.log('');
    logger.warn('Shutting down all services...');

    // Kill all tracked processes by PID (process tree)
    for (const { name, process: proc, port } of processes) {
      if (proc.pid) {
        try {
          logger.info(`Killing ${name} (PID: ${proc.pid})...`);
          await killProcessTree(proc.pid, 'SIGTERM');
        } catch (error) {
          logger.debug(`Failed to kill ${name}: ${error}`);
        }
      }
    }

    // Give processes time to clean up
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Force kill by port as backup
    for (const { name, port } of processes) {
      if (port) {
        try {
          const killed = await killProcessOnPort(port);
          if (killed) {
            logger.warn(`Force killed ${name} on port ${port}`);
          }
        } catch (error) {
          // Best effort
        }
      }
    }

    logger.success('All services stopped');
    process.exit(exitCode);
  };

  // Register cleanup handlers
  process.on('SIGINT', async () => await cleanup(0));
  process.on('SIGTERM', async () => await cleanup(0));
  process.on('uncaughtException', async (error) => {
    logger.error(`Uncaught exception: ${error.message}`);
    await cleanup(1);
  });

  try {
    // Get configuration
    const sharedSecret = config.broker?.secret || 'dev-secret';
    const databaseUrl = config.databaseUrl;

    // Check if database is configured
    if (!databaseUrl) {
      logger.warn('DATABASE_URL not configured');
      logger.info('The web app requires a database. Run one of:');
      logger.log(`  1. ${chalk.cyan('sentryvibe init')} - To set up database`);
      logger.log(`  2. ${chalk.cyan('sentryvibe config set databaseUrl <url>')}`);
      logger.log('');
      process.exit(1);
    }

    logger.info('Starting services...');
    logger.log('');

    // Start Web App
    logger.info(`${chalk.bold('1/3')} Starting web app...`);
    const webApp = spawn('pnpm', ['--filter', 'sentryvibe', 'dev'], {
      cwd: monorepoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: {
        ...process.env,
        PORT: webPort,
        DATABASE_URL: databaseUrl,
        RUNNER_SHARED_SECRET: sharedSecret,
        RUNNER_BROKER_URL: `ws://localhost:${brokerPort}/socket`,
        RUNNER_BROKER_HTTP_URL: `http://localhost:${brokerPort}`,
        WORKSPACE_ROOT: config.workspace,
        RUNNER_ID: config.runner?.id || 'local',
        RUNNER_DEFAULT_ID: config.runner?.id || 'local', // Web app needs this to target the runner
      },
    });

    processes.push({ name: 'Web App', process: webApp, port: Number(webPort) });

    webApp.stdout?.on('data', (data) => {
      const text = data.toString();
      if (text.trim()) {
        logger.log(`${chalk.blue('[web]')} ${text.trim()}`);
      }
    });

    webApp.stderr?.on('data', (data) => {
      const text = data.toString();
      if (text.trim() && !text.includes('warn') && !text.includes('deprecated')) {
        logger.log(`${chalk.yellow('[web]')} ${text.trim()}`);
      }
    });

    webApp.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        logger.error(`Web app exited with code ${code}`);
        cleanup(1);
      }
    });

    // Wait a bit for web app to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start Broker
    logger.info(`${chalk.bold('2/3')} Starting broker...`);
    const broker = spawn('pnpm', ['--filter', 'sentryvibe-broker', 'dev'], {
      cwd: monorepoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: {
        ...process.env,
        PORT: brokerPort,
        BROKER_PORT: brokerPort,
        RUNNER_SHARED_SECRET: sharedSecret,
        RUNNER_EVENT_TARGET_URL: `http://localhost:${webPort}`,
      },
    });

    processes.push({ name: 'Broker', process: broker, port: Number(brokerPort) });

    broker.stdout?.on('data', (data) => {
      const text = data.toString();
      if (text.trim()) {
        logger.log(`${chalk.green('[broker]')} ${text.trim()}`);
      }
    });

    broker.stderr?.on('data', (data) => {
      const text = data.toString();
      if (text.trim() && !text.includes('warn') && !text.includes('deprecated')) {
        logger.log(`${chalk.yellow('[broker]')} ${text.trim()}`);
      }
    });

    broker.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        logger.error(`Broker exited with code ${code}`);
        cleanup(1);
      }
    });

    // Wait a bit for broker to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start Runner
    logger.info(`${chalk.bold('3/3')} Starting runner...`);

    // Import and start the runner directly
    const { startRunner } = await import('../../index.js');

    logger.log('');
    logger.success('All services started!');
    logger.log('');
    logger.info('Services running:');
    logger.log(`  ${chalk.blue('Web App:')} http://localhost:${webPort}`);
    logger.log(`  ${chalk.green('Broker:')} http://localhost:${brokerPort}`);
    logger.log(`  ${chalk.magenta('Runner:')} Connected to broker`);
    logger.log('');
    logger.info(`Press ${chalk.cyan('Ctrl+C')} to stop all services`);
    logger.log('');

    // Start the runner (this will block)
    startRunner({
      brokerUrl: `ws://localhost:${brokerPort}/socket`,
      sharedSecret: sharedSecret,
      runnerId: config.runner?.id || 'local',
      workspace: config.workspace,
    });

  } catch (error) {
    logger.error('Failed to start services:');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    if (error instanceof Error && error.stack) {
      logger.debug(error.stack);
    }
    await cleanup(1);
  }
}
