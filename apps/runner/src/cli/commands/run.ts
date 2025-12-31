import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { configManager } from '../utils/config-manager.js';
import { startRunner } from '../../index.js';

/**
 * Normalize URL by adding protocol if missing
 * Uses http:// for localhost, https:// for everything else
 */
function normalizeUrl(url: string): string {
  if (!url) return url;

  // If protocol already present, return as-is
  if (url.match(/^https?:\/\//i)) {
    return url;
  }

  // For localhost or 127.0.0.1, use http://
  if (url.match(/^(localhost|127\.0\.0\.1)(:|\/|$)/i)) {
    return `http://${url}`;
  }

  // For everything else, use https://
  return `https://${url}`;
}

interface RunOptions {
  wsUrl?: string; // New: WebSocket URL for direct connection
  broker?: string; // Legacy: still supported for backward compatibility
  url?: string;
  workspace?: string;
  runnerId?: string;
  secret?: string;
  verbose?: boolean;
  local?: boolean; // Enable local mode (bypasses authentication)
}

export async function runCommand(options: RunOptions) {
  // Check if initialized
  if (!configManager.isInitialized() && !options.secret) {
    logger.error('Runner not initialized. Please run: sentryvibe-cli init');
    logger.info('Or provide all required options:');
    logger.info('  sentryvibe-cli run --ws-url <url> --url <api-url> --secret <secret>');
    process.exit(1);
  }

  // Set local mode environment variable if requested
  if (options.local) {
    process.env.SENTRYVIBE_LOCAL_MODE = 'true';
    logger.info(chalk.yellow('Local mode enabled - authentication bypassed'));
  }

  // Build runner options from CLI flags or config
  const config = configManager.get();
  const apiUrl = options.url || config.apiUrl || 'http://localhost:3000';

  const runnerOptions = {
    // Prefer new wsUrl option, fall back to legacy broker option, then config
    wsUrl: options.wsUrl || options.broker || configManager.getWsUrl(),
    apiUrl: normalizeUrl(apiUrl),
    sharedSecret: options.secret || configManager.getSecret(),
    runnerId: options.runnerId || config.runner?.id,
    workspace: options.workspace || config.workspace,
  };

  // Validate required options
  if (!runnerOptions.sharedSecret) {
    logger.error('Shared secret is required');
    process.exit(1);
  }

  if (!runnerOptions.wsUrl) {
    logger.error('WebSocket URL is required');
    process.exit(1);
  }

  // Display startup info
  logger.section('Starting SentryVibe Runner');
  logger.info(`Server: ${chalk.cyan(runnerOptions.wsUrl)}`);
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
