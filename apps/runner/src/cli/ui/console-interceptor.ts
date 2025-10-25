/**
 * Console Interceptor for TUI Mode
 * Intercepts stdout/stderr writes to write to log file
 * Prevents logs from bleeding above the TUI
 */

import { ServiceManager } from './service-manager.js';
import { LogFileManager } from './log-file-manager.js';

export class ConsoleInterceptor {
  private serviceManager: ServiceManager;
  private logFileManager: LogFileManager;
  private isActive = false;
  private originalStdoutWrite: any;
  private originalStderrWrite: any;

  constructor(serviceManager: ServiceManager, logFileManager: LogFileManager) {
    this.serviceManager = serviceManager;
    this.logFileManager = logFileManager;

    // Save original stdout/stderr write methods
    // Console methods (log, error, warn, info) all use these under the hood
    this.originalStdoutWrite = process.stdout.write.bind(process.stdout);
    this.originalStderrWrite = process.stderr.write.bind(process.stderr);
  }

  /**
   * Start intercepting console output and writing to log file
   * We only intercept stdout/stderr writes since console.* methods call these under the hood
   */
  start(): void {
    if (this.isActive) return;
    this.isActive = true;

    // Intercept stdout writes - this catches console.log, console.info, and direct writes
    process.stdout.write = (chunk: any, encoding?: any, callback?: any): boolean => {
      const message = typeof chunk === 'string' ? chunk : chunk.toString();

      // ONLY pass through ANSI escape codes (for Ink rendering)
      // Block all other output from reaching the terminal
      if (message.match(/^\x1b\[/)) {
        // This is Ink's control sequence - let it through
        return this.originalStdoutWrite(chunk, encoding, callback);
      }

      // Everything else: write to log file only (don't show on terminal)
      // Don't trim or filter - write the raw message to preserve formatting
      if (message && message.length > 0) {
        const serviceName = this.detectService(message);
        this.logFileManager.write(serviceName, message.trim(), 'stdout');
      }

      // Report success but don't actually write to terminal
      if (callback) callback();
      return true;
    };

    // Intercept stderr writes
    process.stderr.write = (chunk: any, encoding?: any, callback?: any): boolean => {
      const message = typeof chunk === 'string' ? chunk : chunk.toString();

      // ONLY pass through ANSI escape codes (for Ink rendering)
      // Block all other output from reaching the terminal
      if (message.match(/^\x1b\[/)) {
        // This is Ink's control sequence - let it through
        return this.originalStderrWrite(chunk, encoding, callback);
      }

      // Everything else: write to log file only (don't show on terminal)
      // Don't trim or filter - write the raw message to preserve formatting
      if (message && message.length > 0) {
        const serviceName = this.detectService(message);
        this.logFileManager.write(serviceName, message.trim(), 'stderr');
      }

      // Report success but don't actually write to terminal
      if (callback) callback();
      return true;
    };
  }

  /**
   * Get the log file path
   */
  getLogFilePath(): string {
    return this.logFileManager.getLogFilePath();
  }

  /**
   * Stop intercepting and restore original stdout/stderr
   */
  stop(): void {
    if (!this.isActive) return;
    this.isActive = false;

    // Restore stdout/stderr - this also restores console.* methods since they use these
    process.stdout.write = this.originalStdoutWrite;
    process.stderr.write = this.originalStderrWrite;

    // Stop log file writing
    this.logFileManager.stop();
  }

  /**
   * Detect which service the log is from based on content
   */
  private detectService(message: string): 'web' | 'broker' | 'runner' {
    const lower = message.toLowerCase();

    // Check for explicit service tags
    if (message.startsWith('[web]')) return 'web';
    if (message.startsWith('[broker]')) return 'broker';
    if (message.startsWith('[runner]') || message.startsWith('[build]') || message.startsWith('[orchestrator]') || message.startsWith('[engine]')) {
      return 'runner';
    }

    // Infer from content
    if (lower.includes('broker') || lower.includes('websocket')) return 'broker';
    if (lower.includes('next.js') || lower.includes('compiled') || lower.includes('ready in')) return 'web';

    // Default to runner (most console.log calls come from runner)
    return 'runner';
  }
}
