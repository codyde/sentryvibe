/**
 * Console Interceptor for TUI Mode
 * Captures console.log/error/warn and routes them to TUI log system
 * Prevents logs from bleeding above the TUI
 */

import { ServiceManager } from './service-manager.js';

interface InterceptedConsole {
  log: typeof console.log;
  error: typeof console.error;
  warn: typeof console.warn;
  info: typeof console.info;
}

export class ConsoleInterceptor {
  private originalConsole: InterceptedConsole;
  private serviceManager: ServiceManager;
  private isActive = false;

  constructor(serviceManager: ServiceManager) {
    this.serviceManager = serviceManager;

    // Save original console methods
    this.originalConsole = {
      log: console.log.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console),
      info: console.info.bind(console),
    };
  }

  /**
   * Start intercepting console output
   */
  start(): void {
    if (this.isActive) return;
    this.isActive = true;

    // Override console methods
    console.log = (...args: unknown[]) => {
      const message = this.formatMessage(args);
      const serviceName = this.detectService(message);
      this.serviceManager.emit('service:output', serviceName, message + '\n', 'stdout');
    };

    console.error = (...args: unknown[]) => {
      const message = this.formatMessage(args);
      const serviceName = this.detectService(message);
      this.serviceManager.emit('service:output', serviceName, message + '\n', 'stderr');
    };

    console.warn = (...args: unknown[]) => {
      const message = this.formatMessage(args);
      const serviceName = this.detectService(message);
      this.serviceManager.emit('service:output', serviceName, message + '\n', 'stderr');
    };

    console.info = (...args: unknown[]) => {
      const message = this.formatMessage(args);
      const serviceName = this.detectService(message);
      this.serviceManager.emit('service:output', serviceName, message + '\n', 'stdout');
    };
  }

  /**
   * Stop intercepting and restore original console
   */
  stop(): void {
    if (!this.isActive) return;
    this.isActive = false;

    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;
  }

  /**
   * Format console arguments into a string
   */
  private formatMessage(args: unknown[]): string {
    return args
      .map(arg => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.message;
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(' ');
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

  /**
   * Get original console for emergency use
   */
  getOriginal(): InterceptedConsole {
    return this.originalConsole;
  }
}
