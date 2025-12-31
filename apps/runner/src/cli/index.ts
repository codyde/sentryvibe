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

// Sentry instrumentation is loaded via --import flag in bin/sentryvibe.js wrapper
// This ensures instrumentation happens before any ESM module resolution

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

// Check for updates with custom message
const notifier = updateNotifier({
  pkg: packageJson,
  updateCheckInterval: 1000 * 60 * 60 * 24 // Check once per day
});

if (notifier.update) {
  console.log();
  console.log(`  Update available: ${notifier.update.current} → ${notifier.update.latest}`);
  console.log(`  Run: sentryvibe upgrade`);
  console.log();
}

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
    try {
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
    } catch (error) {
      globalErrorHandler.handle(error as Error);
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
    try {
      const { initCommand } = await import('./commands/init.js');
      await initCommand(options);
    } catch (error) {
      globalErrorHandler.handle(error as Error);
    }
  });

program
  .command('run')
  .description('Start the full stack (web app + broker + runner)')
  .option('-p, --port <port>', 'Web app port (default: 3000)')
  .option('-b, --broker-port <port>', 'Broker port (default: 4000)')
  .option('--dev', 'Use development mode (hot reload, slower performance)')
  .option('--rebuild', 'Rebuild services before starting')
  .option('--no-local', 'Disable local mode (require authentication)')
  .action(async (options) => {
    try {
      const { startCommand } = await import('./commands/start.js');
      await startCommand(options);
    } catch (error) {
      globalErrorHandler.handle(error as Error);
    }
  });

program
  .command('build')
  .description('Build all services without starting (useful while app is running)')
  .option('--watch', 'Watch for changes and rebuild automatically')
  .action(async (options) => {
    try {
      const { buildCommand } = await import('./commands/build.js');
      await buildCommand(options);
    } catch (error) {
      globalErrorHandler.handle(error as Error);
    }
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
  .option('-l, --local', 'Enable local mode (bypasses authentication)')
  .action(async (options) => {
    try {
      const { runCommand } = await import('./commands/run.js');
      await runCommand(options);
    } catch (error) {
      globalErrorHandler.handle(error as Error);
    }
  });


program
  .command('config <action> [key] [value]')
  .description('Manage configuration (actions: get, set, list, path, validate, reset)')
  .action(async (action, key, value) => {
    try {
      const { configCommand } = await import('./commands/config.js');
      await configCommand(action, key, value);
    } catch (error) {
      globalErrorHandler.handle(error as Error);
    }
  });

// Alias for config validate
program
  .command('verify')
  .description('Verify configuration is valid (alias for config validate)')
  .action(async () => {
    try {
      const { configCommand } = await import('./commands/config.js');
      await configCommand('validate');
    } catch (error) {
      globalErrorHandler.handle(error as Error);
    }
  });

program
  .command('status')
  .description('Show runner status and configuration')
  .action(async () => {
    try {
      const { statusCommand } = await import('./commands/status.js');
      await statusCommand();
    } catch (error) {
      globalErrorHandler.handle(error as Error);
    }
  });

program
  .command('cleanup')
  .description('Clean up projects and resources')
  .option('--project <slug>', 'Delete specific project')
  .option('--all', 'Clean all projects in workspace')
  .option('--tunnels', 'Close all active tunnels')
  .option('--processes', 'Kill all dev servers')
  .action(async (options) => {
    try {
      const { cleanupCommand } = await import('./commands/cleanup.js');
      await cleanupCommand(options);
    } catch (error) {
      globalErrorHandler.handle(error as Error);
    }
  });

program
  .command('database')
  .alias('db')
  .description('Set up a new database and initialize schema')
  .action(async () => {
    try {
      const { databaseCommand } = await import('./commands/database.js');
      await databaseCommand();
    } catch (error) {
      globalErrorHandler.handle(error as Error);
    }
  });

program
  .command('upgrade')
  .description('Upgrade to latest version (preserves configuration)')
  .option('--branch <branch>', 'Upgrade to specific branch (default: main)')
  .option('--force', 'Skip safety checks (uncommitted changes)')
  .action(async (options) => {
    try {
      const { upgradeCommand } = await import('./commands/upgrade.js');
      await upgradeCommand(options);
    } catch (error) {
      globalErrorHandler.handle(error as Error);
    }
  });

program.parse();