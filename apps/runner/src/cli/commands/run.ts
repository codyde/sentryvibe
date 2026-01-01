import chalk from 'chalk';
import { homedir, userInfo } from 'os';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import { configManager } from '../utils/config-manager.js';
import { startRunner } from '../../index.js';
import { createANSIRenderer, getTUIStateManager, processRunnerEvent } from '../tui/index.js';
import type { RunnerEvent } from '@sentryvibe/agent-core/shared/runner/messages';

// Default public SentryVibe instance
const DEFAULT_URL = 'https://sentryvibe.up.railway.app';
const DEFAULT_WORKSPACE = join(homedir(), 'sentryvibe-workspace');

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

/**
 * Derive WebSocket URL from a base HTTP/HTTPS URL
 * Converts https://example.com to wss://example.com/ws/runner
 */
function deriveWsUrl(baseUrl: string): string {
  const normalized = normalizeUrl(baseUrl);
  const wsProtocol = normalized.startsWith('https://') ? 'wss://' : 'ws://';
  const hostPath = normalized.replace(/^https?:\/\//, '');
  // Remove trailing slash if present
  const cleanHostPath = hostPath.replace(/\/$/, '');
  return `${wsProtocol}${cleanHostPath}/ws/runner`;
}

/**
 * Get the current system username
 */
function getSystemUsername(): string {
  try {
    return userInfo().username;
  } catch {
    // Fallback if userInfo() fails
    return process.env.USER || process.env.USERNAME || 'runner';
  }
}

interface RunOptions {
  broker?: string; // Legacy: WebSocket URL override (deprecated, use --url instead)
  url?: string;
  workspace?: string;
  runnerId?: string;
  secret?: string;
  verbose?: boolean;
  local?: boolean; // Enable local mode (bypasses authentication)
  tui?: boolean; // Enable TUI mode (default: true)
}

export async function runCommand(options: RunOptions) {
  // Set local mode environment variable if requested
  if (options.local) {
    process.env.SENTRYVIBE_LOCAL_MODE = 'true';
    logger.info(chalk.yellow('Local mode enabled - authentication bypassed'));
  }

  // TUI mode is enabled by default, can be disabled with --no-tui
  const useTUI = options.tui !== false;

  // Build runner options from CLI flags or smart defaults
  // NOTE: For the `runner` command, we intentionally ignore local config values
  // and default to the public SentryVibe instance. This command is specifically
  // for connecting to remote servers, not local development.
  // Users can still override with CLI flags if needed.
  
  // Resolve API URL: CLI flag > default public instance (ignore config)
  const apiUrl = normalizeUrl(options.url || DEFAULT_URL);
  
  // Resolve WebSocket URL: CLI broker flag > derive from API URL (ignore config)
  const wsUrl = options.broker || deriveWsUrl(apiUrl);
  
  // Resolve workspace: CLI flag > config > default ~/sentryvibe-workspace
  // (workspace from config is fine since it's user's preference for where projects go)
  const config = configManager.get();
  const workspace = options.workspace || config.workspace || DEFAULT_WORKSPACE;
  
  // Resolve runner ID: CLI flag > system username (ignore config 'local' default)
  const runnerId = options.runnerId || getSystemUsername();
  
  // Resolve secret: CLI flag > config (required)
  const sharedSecret = options.secret || configManager.getSecret();

  // Validate required options - only secret is truly required
  if (!sharedSecret) {
    logger.error('Shared secret is required');
    logger.info('');
    logger.info('Get a runner key from your SentryVibe dashboard, or provide via:');
    logger.info(`  ${chalk.cyan('sentryvibe runner --secret <your-secret>')}`);
    logger.info('');
    logger.info('Or initialize with:');
    logger.info(`  ${chalk.cyan('sentryvibe init --secret <your-secret>')}`);
    process.exit(1);
  }

  // If TUI mode is disabled, use traditional logging
  if (!useTUI) {
    logger.section('Starting SentryVibe Runner');
    logger.info(`Server: ${chalk.cyan(wsUrl)}`);
    logger.info(`API URL: ${chalk.cyan(apiUrl)}`);
    logger.info(`Runner ID: ${chalk.cyan(runnerId)}`);
    logger.info(`Workspace: ${chalk.cyan(workspace)}`);
    logger.log('');

    if (options.verbose) {
      logger.debug('Verbose logging enabled');
      logger.debug(`Full options: ${JSON.stringify({ wsUrl, apiUrl, runnerId, workspace }, null, 2)}`);
    }

    try {
      startRunner({
        wsUrl,
        apiUrl,
        sharedSecret,
        runnerId,
        workspace,
        silent: false,
      });
    } catch (error) {
      logger.error('Failed to start runner:');
      logger.error(error instanceof Error ? error.message : 'Unknown error');
      if (error instanceof Error && error.stack) {
        logger.debug(error.stack);
      }
      process.exit(1);
    }
    return;
  }

  // TUI mode - initialize the ANSI renderer
  let tuiRenderer: Awaited<ReturnType<typeof createANSIRenderer>> | null = null;
  let shutdownRunner: (() => Promise<void>) | null = null;

  try {
    // Get the TUI state manager
    const stateManager = getTUIStateManager();
    
    // Set initial state - show we're starting up
    stateManager.setConnected(false);
    stateManager.addLog({
      service: 'system',
      level: 'info',
      message: `Connecting to ${wsUrl}...`,
    });
    stateManager.addLog({
      service: 'system',
      level: 'info',
      message: `Runner ID: ${runnerId}`,
    });
    stateManager.addLog({
      service: 'system',
      level: 'info',
      message: `Workspace: ${workspace}`,
    });

    // Create and start the TUI renderer
    tuiRenderer = await createANSIRenderer({
      onQuit: async () => {
        // Graceful shutdown
        if (shutdownRunner) {
          stateManager.addLog({
            service: 'system',
            level: 'info',
            message: 'Shutting down runner...',
          });
          await shutdownRunner();
        }
        process.exit(0);
      },
    });

    // Event handler that processes runner events for the TUI
    const handleRunnerEvent = (event: RunnerEvent) => {
      // Process the event for TUI state updates
      processRunnerEvent(event);
      
      // Update connection state based on event type
      if (event.type === 'runner-status') {
        stateManager.setConnected(true);
      }
    };

    // Start the runner with TUI event callback
    shutdownRunner = await startRunner({
      wsUrl,
      apiUrl,
      sharedSecret,
      runnerId,
      workspace,
      silent: true, // Suppress console.log output in TUI mode
      onEvent: handleRunnerEvent,
    });

  } catch (error) {
    // If TUI fails to start, fall back to traditional mode
    if (tuiRenderer) {
      await tuiRenderer.stop();
    }
    
    logger.error('Failed to start TUI, falling back to traditional mode');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    
    // Retry without TUI
    try {
      startRunner({
        wsUrl,
        apiUrl,
        sharedSecret,
        runnerId,
        workspace,
        silent: false,
      });
    } catch (retryError) {
      logger.error('Failed to start runner:');
      logger.error(retryError instanceof Error ? retryError.message : 'Unknown error');
      process.exit(1);
    }
  }
}
