/**
 * Log File Manager
 * Writes logs to a file for TUI to read periodically
 */

import { createWriteStream, WriteStream, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export class LogFileManager {
  private logFile: string;
  private writeStream: WriteStream | null = null;

  constructor() {
    // Create logs directory if it doesn't exist
    const logsDir = join(process.cwd(), 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }

    // Create log file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = join(logsDir, `sentryvibe-${timestamp}.log`);
  }

  /**
   * Start writing to log file
   */
  start(): void {
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
   * Get the log file path
   */
  getLogFilePath(): string {
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
