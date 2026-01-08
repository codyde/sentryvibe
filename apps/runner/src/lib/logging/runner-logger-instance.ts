/**
 * RunnerLogger Instance Management
 * 
 * This module provides the singleton logger instance that can be:
 * - Configured at startup (via initRunnerLogger)
 * - Accessed from anywhere in the runner (via getLogger)
 * - Integrated with the TUI dashboard
 * 
 * Note: Uses the same singleton as runner-logger.ts to ensure
 * all code shares the same instance.
 */

import { RunnerLogger, createRunnerLogger, getRunnerLogger, type RunnerLoggerOptions } from './runner-logger.js';

let loggerOptions: RunnerLoggerOptions = {};
let initialized = false;

/**
 * Initialize the logger with options
 * Call this early in the runner startup
 * 
 * If already initialized (e.g., by TUI before startRunner), returns the existing instance
 * to preserve event subscriptions.
 */
export function initRunnerLogger(options: RunnerLoggerOptions): RunnerLogger {
  if (initialized) {
    // Already initialized - return existing instance to preserve subscriptions
    // But update options if needed
    const logger = getRunnerLogger();
    if (options.verbose !== undefined) {
      logger.setVerbose(options.verbose);
    }
    return logger;
  }
  
  loggerOptions = options;
  initialized = true;
  return createRunnerLogger(options);
}

/**
 * Get the current logger instance
 * Uses the shared singleton from runner-logger.ts
 */
export function getLogger(): RunnerLogger {
  if (!initialized) {
    // Create with default options if not initialized
    return createRunnerLogger(loggerOptions);
  }
  return getRunnerLogger();
}

/**
 * Check if verbose mode is enabled
 */
export function isVerbose(): boolean {
  return getLogger().isVerbose();
}

/**
 * Set verbose mode at runtime
 */
export function setVerbose(verbose: boolean): void {
  getLogger().setVerbose(verbose);
}

/**
 * Check if TUI mode is enabled
 */
export function isTuiMode(): boolean {
  // Check options - tuiMode defaults to true
  return loggerOptions.tuiMode !== false;
}

// Re-export types for convenience
export type { RunnerLoggerOptions } from './runner-logger.js';
export type { LogEntry, BuildInfo, TodoItem, BuildCompletionStats } from './types.js';
