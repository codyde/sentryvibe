#!/usr/bin/env node
// IMPORTANT: Ensure vendor packages are extracted before any imports
// pnpm postinstall doesn't always run reliably for global installs from URLs
import { existsSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if running in development mode (linked via pnpm/npm link)
// Skip vendor install if we're in the monorepo - dependencies are handled by pnpm
const isLinkedDevelopment = __dirname.includes('/sentryvibe/apps/runner/dist');

// Only run vendor install for production global installs
if (!isLinkedDevelopment) {
  // Check if agent-core is missing and extract from vendor if needed
  const nodeModulesDir = resolve(__dirname, "../../");
  const agentCorePath = join(nodeModulesDir, "@sentryvibe", "agent-core");

  if (!existsSync(agentCorePath)) {
    // Silently initialize vendor packages in background
    try {
      const installScript = resolve(__dirname, "../../scripts/install-vendor.js");
      execFileSync("node", [installScript], {
        cwd: resolve(__dirname, "../.."),
        stdio: "pipe" // Silent mode - output only shown if VERBOSE=1
      });
    } catch (error) {
      console.error("Failed to initialize vendor packages:", error);
      process.exit(1);
    }
  }
}

import { Command } from 'commander';
import updateNotifier from 'update-notifier';
import { displayBanner } from './utils/banner.js';
import { setupGlobalErrorHandlers, globalErrorHandler } from './utils/error-handler.js';
import { setupShutdownHandler } from './utils/shutdown-handler.js';

// Get package.json for version info
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8')
);

// Setup global error handlers for uncaught errors
setupGlobalErrorHandlers();

// Setup graceful shutdown handlers for Ctrl+C
export const shutdownHandler = setupShutdownHandler({
  timeout: 5000,
  verbose: true,
});

// Display splash screen banner
displayBanner();

// Check for updates
updateNotifier({ pkg: packageJson }).notify();

const program = new Command();

program
  .name('sentryvibe')
  .description('SentryVibe CLI - Start full stack or runner only')
  .version(packageJson.version)
  .option('--runner', 'Start runner only (skip web app and broker)')
  .option('--debug', 'Enable debug mode with verbose error output')
  .hook('preAction', (thisCommand) => {
    // Enable debug mode if --debug flag is present
    const opts = thisCommand.opts();
    if (opts.debug) {
      globalErrorHandler.setDebug(true);
      process.env.DEBUG = '1';
    }
  })
  .action(async (options) => {
    // Default action when no subcommand is provided
    if (options.runner) {
      // Start runner only
      const { runCommand } = await import('./commands/run.js');
      await runCommand({});
    } else {
      // Start full stack
      const { startCommand } = await import('./commands/start.js');
      await startCommand({});
    }
  });

// Import commands
program
  .command('init')
  .description('Initialize workspace and configuration')
  .option('--workspace <path>', 'Set workspace directory')
  .option('--broker <url>', 'Set broker WebSocket URL')
  .option('--url <url>', 'Set API base URL (default: http://localhost:3000)')
  .option('--secret <secret>', 'Set shared secret')
  .option('--branch <branch>', 'Git branch to clone (default: main)')
  .option('--database [value]', 'Database setup: "neondb" (auto-setup), connection string, or omit to auto-setup in -y mode')
  .option('-y, --yes', 'Accept all defaults (non-interactive mode)')
  .option('--non-interactive', 'Use defaults without prompts (alias for -y)')
  .action(async (options) => {
    const { initCommand } = await import('./commands/init.js');
    await initCommand(options);
  });

program
  .command('run')
  .description('Start the full stack (web app + broker + runner)')
  .option('-p, --port <port>', 'Web app port (default: 3000)')
  .option('-b, --broker-port <port>', 'Broker port (default: 4000)')
  .action(async (options) => {
    const { startCommand } = await import('./commands/start.js');
    await startCommand(options);
  });


program
  .command('runner')
  .description('Start runner only (connect to existing broker)')
  .option('-b, --broker <url>', 'Broker WebSocket URL')
  .option('-u, --url <url>', 'API base URL (e.g., https://sentryvibe.up.railway.app)')
  .option('-w, --workspace <path>', 'Workspace directory path')
  .option('-i, --runner-id <id>', 'Runner identifier')
  .option('-s, --secret <secret>', 'Shared secret for authentication')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(async (options) => {
    const { runCommand } = await import('./commands/run.js');
    await runCommand(options);
  });


program
  .command('config <action> [key] [value]')
  .description('Manage configuration (actions: get, set, list, path, validate, reset)')
  .action(async (action, key, value) => {
    const { configCommand } = await import('./commands/config.js');
    await configCommand(action, key, value);
  });

program
  .command('status')
  .description('Show runner status and configuration')
  .action(async () => {
    const { statusCommand } = await import('./commands/status.js');
    await statusCommand();
  });

program
  .command('cleanup')
  .description('Clean up projects and resources')
  .option('--project <slug>', 'Delete specific project')
  .option('--all', 'Clean all projects in workspace')
  .option('--tunnels', 'Close all active tunnels')
  .option('--processes', 'Kill all dev servers')
  .action(async (options) => {
    const { cleanupCommand } = await import('./commands/cleanup.js');
    await cleanupCommand(options);
  });

program
  .command('database')
  .alias('db')
  .description('Set up a new database and initialize schema')
  .action(async () => {
    const { databaseCommand } = await import('./commands/database.js');
    await databaseCommand();
  });


  program.parse();