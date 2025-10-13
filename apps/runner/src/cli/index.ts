#!/usr/bin/env node
import { Command } from 'commander';
import updateNotifier from 'update-notifier';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get package.json for version info
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8')
);

// Check for updates
updateNotifier({ pkg: packageJson }).notify();

const program = new Command();

program
  .name('sentryvibe')
  .description('SentryVibe CLI - Start full stack or runner only')
  .version(packageJson.version)
  .option('--runner', 'Start runner only (skip web app and broker)')
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
  .option('--secret <secret>', 'Set shared secret')
  .option('--branch <branch>', 'Git branch to clone (default: main)')
  .option('--database', 'Set up new database and push schema')
  .option('--non-interactive', 'Use defaults without prompts')
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
