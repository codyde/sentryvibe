/**
 * Log File Manager
 * Writes logs to a file for TUI to read periodically
 * Only active when DEBUG=true environment variable is set
 */

import { createWriteStream, WriteStream, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export class LogFileManager {
  private logFile: string | null = null;
  private writeStream: WriteStream | null = null;
  private enabled: boolean;

  constructor() {
    // Only enable log file creation when DEBUG=true
    this.enabled = process.env.DEBUG === 'true';

    if (this.enabled) {
      // Create logs directory if it doesn't exist
      const logsDir = join(process.cwd(), 'logs');
      if (!existsSync(logsDir)) {
        mkdirSync(logsDir, { recursive: true });
      }

      // Create log file with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.logFile = join(logsDir, `sentryvibe-${timestamp}.log`);
    }
  }

  /**
   * Check if logging is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Start writing to log file
   */
  start(): void {
    if (!this.enabled || !this.logFile) return;

    this.writeStream = createWriteStream(this.logFile, { flags: 'a' });
    // Write a startup marker
    this.writeStream.write(`[${new Date().toISOString()}] [system] [stdout] === Log file started ===\n`);
  }

  /**
   * Write a log entry to file
   * Format: [timestamp] [service] [stream] message
   */
  write(service: string, message: string, stream: 'stdout' | 'stderr'): void {
    if (!this.writeStream) return;

    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${service}] [${stream}] ${message}\n`;

    this.writeStream.write(logLine, (err) => {
      if (err) {
        // Fallback to console if write fails (but this shouldn't happen often)
        console.error('Failed to write to log file:', err);
      }
    });
  }

  /**
   * Get the log file path (null if logging is disabled)
   */
  getLogFilePath(): string | null {
    return this.logFile;
  }

  /**
   * Stop writing and close the file stream
   */
  stop(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }
}
