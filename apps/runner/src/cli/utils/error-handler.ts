/**
 * Centralized error handling and formatting for CLI
 * Displays errors with context, suggestions, and proper formatting
 */

import chalk from 'chalk';
import { CLIError, ErrorCode } from './cli-error.js';

export interface ErrorHandlerOptions {
  debug?: boolean;
  exitOnError?: boolean;
}

export class CLIErrorHandler {
  private debug: boolean;
  private exitOnError: boolean;

  constructor(options: ErrorHandlerOptions = {}) {
    this.debug = options.debug ?? process.env.DEBUG === '1';
    this.exitOnError = options.exitOnError ?? true;
  }

  /**
   * Main error handling method
   * Formats and displays error, then exits if fatal
   */
  handle(error: Error | CLIError): void {
    // Convert to CLIError if needed
    const cliError = error instanceof CLIError
      ? error
      : this.convertToCLIError(error);

    // Display the error
    this.display(cliError);

    // Exit if fatal and exitOnError is enabled
    if (cliError.fatal && this.exitOnError) {
      process.exit(cliError.getExitCode());
    }
  }

  /**
   * Display formatted error to console
   */
  private display(error: CLIError): void {
    console.error(); // Empty line for spacing

    // Error header
    console.error(chalk.red('✗'), chalk.bold(error.message));

    // Error code (in debug mode)
    if (this.debug) {
      console.error(chalk.dim(`  Code: ${error.code}`));
    }

    // Context information
    if (error.context && Object.keys(error.context).length > 0) {
      console.error();
      console.error(chalk.dim('  Details:'));
      Object.entries(error.context).forEach(([key, value]) => {
        console.error(chalk.dim(`    ${key}: ${this.formatValue(value)}`));
      });
    }

    // Suggestions
    if (error.suggestions.length > 0) {
      console.error();
      console.error(chalk.yellow('  Try this:'));
      error.suggestions.forEach((suggestion, index) => {
        console.error(chalk.yellow(`    ${index + 1}. ${suggestion}`));
      });
    }

    // Documentation link
    if (error.docs) {
      console.error();
      console.error(chalk.dim('  Documentation:'), chalk.cyan(error.docs));
    }

    // Stack trace (debug mode only)
    if (this.debug && error.stack) {
      console.error();
      console.error(chalk.dim('  Stack trace:'));
      console.error(chalk.dim(error.stack));
    }

    // Original error cause (if available)
    if (this.debug && error.cause) {
      console.error();
      console.error(chalk.dim('  Caused by:'));
      console.error(chalk.dim(error.cause.message));
      if (error.cause.stack) {
        console.error(chalk.dim(error.cause.stack));
      }
    }

    console.error(); // Empty line for spacing
  }

  /**
   * Format context values for display
   */
  private formatValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return value.join(', ');
    return JSON.stringify(value);
  }

  /**
   * Convert generic errors to CLIError
   */
  private convertToCLIError(error: Error): CLIError {
    // Try to infer error code from message
    const code = this.inferErrorCode(error);

    return new CLIError({
      code,
      message: error.message || 'An unexpected error occurred',
      cause: error,
      suggestions: ['Run with --debug flag for more details'],
    });
  }

  /**
   * Infer error code from generic error
   */
  private inferErrorCode(error: Error): ErrorCode {
    const message = error.message.toLowerCase();

    if (message.includes('econnrefused') || message.includes('connection refused')) {
      return 'DB_CONNECTION_FAILED';
    }
    if (message.includes('eaddrinuse') || message.includes('address already in use')) {
      return 'PORT_IN_USE';
    }
    if (message.includes('eacces') || message.includes('permission denied')) {
      return 'PERMISSION_DENIED';
    }
    if (message.includes('enoent') || message.includes('no such file')) {
      return 'CONFIG_NOT_FOUND';
    }

    return 'UNKNOWN_ERROR';
  }

  /**
   * Wrap an async function with error handling
   * Usage: await errorHandler.wrap(() => someAsyncFunction(), 'Description')
   */
  async wrap<T>(
    fn: () => Promise<T>,
    context?: string
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (context && error instanceof CLIError) {
        // Create new CLIError with added context (can't modify readonly property)
        const enhancedError = new CLIError({
          code: error.code,
          message: error.message,
          context: { ...error.context, operation: context },
          suggestions: error.suggestions,
          fatal: error.fatal,
          cause: error.cause,
          docs: error.docs,
        });
        this.handle(enhancedError);
        throw enhancedError;
      }
      this.handle(error as Error);
      throw error; // Re-throw for callers that want to handle it
    }
  }

  /**
   * Enable or disable debug mode
   */
  setDebug(debug: boolean): void {
    this.debug = debug;
  }

  /**
   * Enable or disable exit on error
   */
  setExitOnError(exitOnError: boolean): void {
    this.exitOnError = exitOnError;
  }
}

/**
 * Global error handler instance
 * Can be configured once and used throughout the CLI
 */
export const globalErrorHandler = new CLIErrorHandler();

/**
 * Setup global error handlers for uncaught errors
 */
export function setupGlobalErrorHandlers(): void {
  process.on('uncaughtException', (error: Error) => {
    console.error(chalk.red('\n✗ Uncaught exception:'));
    globalErrorHandler.handle(error);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    console.error(chalk.red('\n✗ Unhandled promise rejection:'));
    const error = reason instanceof Error ? reason : new Error(String(reason));
    globalErrorHandler.handle(error);
  });
}
