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
  private buffer: Array<{ message: string; service: string; stream: 'stdout' | 'stderr' }> = [];
  private isBuffering = true;
  private originalStdoutWrite: any;
  private originalStderrWrite: any;

  constructor(serviceManager: ServiceManager) {
    this.serviceManager = serviceManager;

    // Save original console methods
    this.originalConsole = {
      log: console.log.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console),
      info: console.info.bind(console),
    };

    // Save original stdout/stderr write methods
    this.originalStdoutWrite = process.stdout.write.bind(process.stdout);
    this.originalStderrWrite = process.stderr.write.bind(process.stderr);
  }

  /**
   * Start intercepting console output (buffers until flush is called)
   */
  start(): void {
    if (this.isActive) return;
    this.isActive = true;

    // Override console methods to buffer output
    console.log = (...args: unknown[]) => {
      const message = this.formatMessage(args);
      const serviceName = this.detectService(message);

      if (this.isBuffering) {
        this.buffer.push({ message, service: serviceName, stream: 'stdout' });
      } else {
        this.serviceManager.emit('service:output', serviceName, message + '\n', 'stdout');
      }
    };

    console.error = (...args: unknown[]) => {
      const message = this.formatMessage(args);
      const serviceName = this.detectService(message);

      if (this.isBuffering) {
        this.buffer.push({ message, service: serviceName, stream: 'stderr' });
      } else {
        this.serviceManager.emit('service:output', serviceName, message + '\n', 'stderr');
      }
    };

    console.warn = (...args: unknown[]) => {
      const message = this.formatMessage(args);
      const serviceName = this.detectService(message);

      if (this.isBuffering) {
        this.buffer.push({ message, service: serviceName, stream: 'stderr' });
      } else {
        this.serviceManager.emit('service:output', serviceName, message + '\n', 'stderr');
      }
    };

    console.info = (...args: unknown[]) => {
      const message = this.formatMessage(args);
      const serviceName = this.detectService(message);

      if (this.isBuffering) {
        this.buffer.push({ message, service: serviceName, stream: 'stdout' });
      } else {
        this.serviceManager.emit('service:output', serviceName, message + '\n', 'stdout');
      }
    };
  }

  /**
   * Flush buffered logs and stop buffering (call after TUI renders)
   */
  flush(): void {
    this.isBuffering = false;

    // Emit all buffered logs
    for (const entry of this.buffer) {
      this.serviceManager.emit('service:output', entry.service as any, entry.message + '\n', entry.stream);
    }

    // Clear buffer
    this.buffer = [];
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
