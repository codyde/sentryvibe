import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { prompts } from '../utils/prompts.js';
import { configManager } from '../utils/config-manager.js';
import { spinner } from '../utils/spinner.js';
import { isInsideMonorepo, findMonorepoRoot } from '../utils/repo-detector.js';
import { cloneRepository, installDependencies, isPnpmInstalled } from '../utils/repo-cloner.js';
import { setupDatabase, pushDatabaseSchema, connectManualDatabase } from '../utils/database-setup.js';
import { displaySetupComplete } from '../utils/banner.js';

interface InitOptions {
  workspace?: string;
  broker?: string;
  secret?: string;
  branch?: string;
  database?: boolean;
  yes?: boolean;
  nonInteractive?: boolean;
}

export async function initCommand(options: InitOptions) {
  logger.section('SentryVibe Runner Setup');
  logger.log('');

  // Step 1: Check for monorepo
  logger.info('Checking for SentryVibe repository...');
  const repoCheck = await isInsideMonorepo();

  let monorepoPath: string | undefined;

  if (repoCheck.inside && repoCheck.root) {
    logger.success(`Found repository at: ${chalk.cyan(repoCheck.root)}`);
    monorepoPath = repoCheck.root;

    // Update config if path changed
    const savedPath = configManager.get('monorepoPath');
    if (savedPath && savedPath !== monorepoPath) {
      logger.info(`Updating monorepo path (was: ${savedPath})`);
    }
  } else {
    logger.warn('SentryVibe repository not found in current directory');
    logger.log('');

    if (options.nonInteractive) {
      logger.error('Repository required but not found. Cannot clone in non-interactive mode.');
      logger.info('Please clone manually or run without --non-interactive');
      process.exit(1);
    }

    // Offer to clone
    const shouldClone = await prompts.confirm(
      'Would you like to clone the SentryVibe repository?',
      true
    );

    if (!shouldClone) {
      logger.info('Setup cancelled. Please clone the repository manually and run init again.');
      process.exit(0);
    }

    // Check for pnpm
    const hasPnpm = await isPnpmInstalled();
    if (!hasPnpm) {
      logger.error('pnpm is not installed');
      logger.info('Install pnpm first: npm install -g pnpm');
      process.exit(1);
    }

    // Get clone location - default to current directory + /sentryvibe
    const defaultClonePath = join(process.cwd(), 'sentryvibe');
    const clonePath = await prompts.input(
      'Where should the repository be cloned?',
      defaultClonePath
    );

    // Get branch to clone - silent flag, defaults to 'main'
    const branchToClone = options.branch || 'main';

    logger.log('');
    logger.info(`Cloning branch: ${chalk.cyan(branchToClone)}`);
    logger.log('');

    try {
      // Clone the repository
      monorepoPath = await cloneRepository({
        targetPath: clonePath,
        branch: branchToClone,
      });

      logger.log('');

      // Check if vendor directory exists - if not, we need to build agent-core first
      const vendorPath = join(monorepoPath, 'vendor');
      const agentCoreTgz = join(vendorPath, 'sentryvibe-agent-core-0.1.0.tgz');

      if (!existsSync(agentCoreTgz)) {
        logger.warn('vendor/sentryvibe-agent-core-0.1.0.tgz not found in cloned repo');
        logger.info('Building agent-core package from source...');
        logger.log('');

        // Build agent-core from source
        const { spawn } = await import('child_process');

        spinner.start('Building agent-core...');

        await new Promise<void>((resolve, reject) => {
          const proc = spawn('bash', ['-c', 'cd packages/agent-core && pnpm build && pnpm pack && mkdir -p ../../vendor && mv *.tgz ../../vendor/'], {
            cwd: monorepoPath,
            stdio: 'inherit',
          });

          proc.on('exit', (code) => {
            if (code === 0) {
              spinner.succeed('agent-core built and packaged');
              resolve();
            } else {
              spinner.fail('Failed to build agent-core');
              reject(new Error(`agent-core build failed with code ${code}`));
            }
          });

          proc.on('error', (error) => {
            spinner.fail('Failed to build agent-core');
            reject(error);
          });
        });

        logger.log('');
      }

      // Install dependencies for entire monorepo
      logger.info('This may take several minutes...');
      await installDependencies(monorepoPath);

      logger.log('');
      logger.success('Repository setup complete!');
      logger.log('');
    } catch (error) {
      logger.error('Failed to set up repository');
      logger.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  }

  logger.log('');

  // Handle -y / --yes flag (alias for --non-interactive)
  const isNonInteractive = options.nonInteractive || options.yes;

  // Check if already initialized - default to YES for reset
  if (configManager.isInitialized()) {
    logger.warn('Configuration already exists');

    if (isNonInteractive) {
      // In non-interactive mode, always reset
      logger.info('Resetting configuration...');
      configManager.reset();
    } else {
      const shouldReset = await prompts.confirm(
        'Do you want to reset and reconfigure?',
        true  // Default to YES
      );
      if (!shouldReset) {
        logger.info('Setup cancelled');
        return;
      }
      configManager.reset();
    }
  }

  let answers;

  if (isNonInteractive) {
    // Non-interactive mode: use provided options or defaults
    answers = {
      workspace: options.workspace || configManager.get('workspace'),
      brokerUrl: options.broker || configManager.get('broker').url,
      secret: options.secret || '',
      runnerId: configManager.get('runner').id,
    };

    if (!answers.secret) {
      logger.error('--secret is required in non-interactive mode');
      process.exit(1);
    }
  } else {
    // Interactive mode
    logger.info('Let\'s configure your runner...\n');
    answers = await prompts.promptInit();
  }

  // Create workspace directory
  spinner.start('Creating workspace directory...');
  try {
    if (!existsSync(answers.workspace)) {
      await mkdir(answers.workspace, { recursive: true });
      spinner.succeed(`Workspace created: ${chalk.cyan(answers.workspace)}`);
    } else {
      spinner.info(`Workspace exists: ${chalk.cyan(answers.workspace)}`);
    }
  } catch (error) {
    spinner.fail('Failed to create workspace directory');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }

  // Setup database (for full-stack mode)
  logger.log('');
  let databaseUrl: string | undefined;

  if (monorepoPath) {
    // In non-interactive mode, always setup database
    // In interactive mode, default to YES
    const shouldSetupDb = isNonInteractive || options.database || await prompts.confirm(
      'Set up a Neon PostgreSQL database? (Required for full-stack mode)',
      true  // Default to YES
    );

    if (shouldSetupDb) {
      logger.log('');
      databaseUrl = await setupDatabase(monorepoPath) || undefined;
    } else if (!isNonInteractive) {
      // User declined Neon setup - offer manual connection
      const shouldConnectManually = await prompts.confirm(
        'Would you like to connect an existing database?',
        true  // Default to YES
      );

      if (shouldConnectManually) {
        databaseUrl = await connectManualDatabase() || undefined;
      }
    }

    // If we have a database URL, push the schema
    if (databaseUrl) {
      logger.log('');
      // Auto-push schema (no prompt needed - it's required)
      const pushed = await pushDatabaseSchema(monorepoPath, databaseUrl);

      if (!pushed) {
        logger.warn('Schema push failed - you can try manually later');
        logger.info(`  cd ${monorepoPath}/apps/sentryvibe`);
        logger.info(`  DATABASE_URL="${databaseUrl}" npx drizzle-kit push --config=drizzle.config.ts`);
      }
    } else {
      logger.warn('Database setup skipped or failed');
      logger.info('You can set it later with: sentryvibe config set databaseUrl <url>');
      logger.info('Or run: sentryvibe database');
    }
  }

  logger.log('');

  // Save configuration
  try {
    configManager.set('workspace', answers.workspace);
    if (monorepoPath) {
      configManager.set('monorepoPath', monorepoPath);
    }
    if (databaseUrl) {
      configManager.set('databaseUrl', databaseUrl);
    }
    configManager.set('broker', {
      url: answers.brokerUrl,
      secret: answers.secret,
    });
    configManager.set('runner', {
      id: answers.runnerId,
      reconnectAttempts: 5,
      heartbeatInterval: 15000,
    });
    configManager.set('tunnel', {
      provider: 'cloudflare',
      autoCreate: true,
    });
  } catch (error) {
    logger.error('Failed to save configuration');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }

  // Validate configuration
  const validation = configManager.validate();
  if (!validation.valid) {
    logger.error('Configuration validation failed:');
    validation.errors.forEach((err) => logger.error(`  - ${err}`));
    process.exit(1);
  }

  // Success
  logger.log('');
  logger.log('');
  displaySetupComplete();
  logger.log('');
  logger.info(`Config file: ${chalk.cyan(configManager.path)}`);
  logger.info(`Workspace: ${chalk.cyan(answers.workspace)}`);
  if (monorepoPath) {
    logger.info(`Repository: ${chalk.cyan(monorepoPath)}`);
  }
  logger.log('');
  logger.info('Next steps:');
  if (monorepoPath) {
    logger.log(`  1. Run ${chalk.cyan('sentryvibe run')} to start the full stack`);
    logger.log(`  2. Or ${chalk.cyan('sentryvibe --runner')} for runner only`);
  } else {
    logger.log(`  1. Run ${chalk.cyan('sentryvibe run')} to start the full stack`);
    logger.log(`  2. Or ${chalk.cyan('sentryvibe --runner')} for runner only`);
  }
  logger.log('');
  logger.log('');
  logger.info(`Run ${chalk.cyan('sentryvibe --help')} to see all available commands and options`);
  logger.log('');
}
