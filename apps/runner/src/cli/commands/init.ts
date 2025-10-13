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
import { setupDatabase, pushDatabaseSchema } from '../utils/database-setup.js';

interface InitOptions {
  workspace?: string;
  broker?: string;
  secret?: string;
  branch?: string;
  database?: boolean;
  nonInteractive?: boolean;
}

export async function initCommand(options: InitOptions) {
  logger.section('SentryVibe Runner Setup');
  logger.log('');

  // Step 1: Check for monorepo
  logger.info('Checking for SentryVibe repository...');
  const repoCheck = await isInsideMonorepo();

  let monorepoPath: string | undefined;

  if (repoCheck.inside) {
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

    // Get branch to clone
    let branchToClone = options.branch || 'main';
    if (!options.branch) {
      branchToClone = await prompts.input(
        'Which branch should be cloned?',
        'main'
      );
    }

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

      // Install dependencies
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

  // Check if already initialized
  if (configManager.isInitialized()) {
    logger.warn('Configuration already exists');
    const shouldReset = await prompts.confirm(
      'Do you want to reset and reconfigure?',
      false
    );
    if (!shouldReset) {
      logger.info('Setup cancelled');
      return;
    }
    configManager.reset();
  }

  let answers;

  if (options.nonInteractive) {
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

  if (monorepoPath && (options.database || !options.nonInteractive)) {
    const shouldSetupDb = options.database || await prompts.confirm(
      'Set up a Neon PostgreSQL database? (Required for full-stack mode)',
      true
    );

    if (shouldSetupDb) {
      logger.log('');
      databaseUrl = await setupDatabase(monorepoPath) || undefined;

      if (databaseUrl) {
        logger.success(`Database URL saved`);
        logger.log('');

        // Offer to push schema
        const shouldPushSchema = options.database || await prompts.confirm(
          'Initialize database schema with Drizzle?',
          true
        );

        if (shouldPushSchema) {
          logger.log('');
          const pushed = await pushDatabaseSchema(monorepoPath, databaseUrl);

          if (!pushed) {
            logger.warn('Schema push failed - you can try manually later');
            logger.info(`  cd ${monorepoPath}/apps/sentryvibe`);
            logger.info(`  DATABASE_URL="${databaseUrl}" npx drizzle-kit push --config=drizzle.config.ts`);
          }
        }
      } else {
        logger.warn('Database setup skipped or failed');
        logger.info('You can set it later with: sentryvibe config set databaseUrl <url>');
        logger.info('Or run: sentryvibe database');
      }
    }
  }

  logger.log('');

  // Save configuration
  spinner.start('Saving configuration...');
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

    spinner.succeed('Configuration saved');
  } catch (error) {
    spinner.fail('Failed to save configuration');
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
  logger.success('Setup complete! 🎉');
  logger.log('');
  logger.info(`Config file: ${chalk.cyan(configManager.path)}`);
  logger.info(`Workspace: ${chalk.cyan(answers.workspace)}`);
  if (monorepoPath) {
    logger.info(`Repository: ${chalk.cyan(monorepoPath)}`);
  }
  logger.log('');
  logger.info('Next steps:');
  if (monorepoPath) {
    logger.log(`  1. Navigate to repository: ${chalk.cyan(`cd ${monorepoPath}`)}`);
    logger.log(`  2. Run ${chalk.cyan('sentryvibe run')} to start the full stack`);
    logger.log(`  3. Or ${chalk.cyan('sentryvibe --runner')} for runner only`);
  } else {
    logger.log(`  1. Run ${chalk.cyan('sentryvibe run')} to start the full stack`);
    logger.log(`  2. Or ${chalk.cyan('sentryvibe --runner')} for runner only`);
  }
  logger.log('');
}
