import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { configManager } from '../utils/config-manager.js';
import { startRunner } from '../../index.js';

/**
 * Normalize URL by adding https:// if protocol is missing
 */
function normalizeUrl(url: string): string {
  if (!url) return url;

  // If no protocol, add https://
  if (!url.match(/^https?:\/\//i)) {
    return `https://${url}`;
  }

  return url;
}

interface RunOptions {
  broker?: string;
  url?: string;
  workspace?: string;
  runnerId?: string;
  secret?: string;
  verbose?: boolean;
}

export async function runCommand(options: RunOptions) {
  // Check if initialized
  if (!configManager.isInitialized() && !options.secret) {
    logger.error('Runner not initialized. Please run: sentryvibe-cli init');
    logger.info('Or provide all required options:');
    logger.info('  sentryvibe-cli run --broker <url> --url <api-url> --secret <secret>');
    process.exit(1);
  }

  // Build runner options from CLI flags or config
  const config = configManager.get();
  const apiUrl = options.url || config.apiUrl || 'http://localhost:3000';

  const runnerOptions = {
    brokerUrl: options.broker || config.broker?.url,
    apiUrl: normalizeUrl(apiUrl),
    sharedSecret: options.secret || config.broker?.secret,
    runnerId: options.runnerId || config.runner?.id,
    workspace: options.workspace || config.workspace,
  };

  // Validate required options
  if (!runnerOptions.sharedSecret) {
    logger.error('Shared secret is required');
    process.exit(1);
  }

  if (!runnerOptions.brokerUrl) {
    logger.error('Broker URL is required');
    process.exit(1);
  }

  // Display startup info
  logger.section('Starting SentryVibe Runner');
  logger.info(`Broker: ${chalk.cyan(runnerOptions.brokerUrl)}`);
  logger.info(`API URL: ${chalk.cyan(runnerOptions.apiUrl)}`);
  logger.info(`Runner ID: ${chalk.cyan(runnerOptions.runnerId)}`);
  logger.info(`Workspace: ${chalk.cyan(runnerOptions.workspace)}`);
  logger.log('');

  if (options.verbose) {
    logger.debug('Verbose logging enabled');
    logger.debug(`Full options: ${JSON.stringify(runnerOptions, null, 2)}`);
  }

  try {
    // Start the runner
    startRunner(runnerOptions);
  } catch (error) {
    logger.error('Failed to start runner:');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    if (error instanceof Error && error.stack) {
      logger.debug(error.stack);
    }
    process.exit(1);
  }
}
