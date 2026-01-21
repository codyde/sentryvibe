/**
 * In-Memory Command Queue for Runner Commands
 * 
 * Provides reliable command delivery to runners with:
 * - Automatic queuing when runner is disconnected
 * - Retry logic with configurable attempts
 * - Command expiration (TTL)
 * - Per-runner queuing
 */

import type { RunnerCommand } from '../../shared/runner/messages';
import { buildLogger } from '../logging/build-logger';

interface QueuedCommand {
  command: RunnerCommand;
  runnerId: string;
  queuedAt: number;
  attempts: number;
  maxAttempts: number;
  ttlMs: number; // Time to live in milliseconds
  onSuccess?: () => void;
  onFailure?: (error: string) => void;
}

interface CommandQueueOptions {
  maxQueueSize?: number; // Max commands per runner
  defaultTtlMs?: number; // Default TTL for commands
  defaultMaxAttempts?: number; // Default retry attempts
  cleanupIntervalMs?: number; // How often to clean expired commands
}

const DEFAULT_OPTIONS: Required<CommandQueueOptions> = {
  maxQueueSize: 100,
  defaultTtlMs: 5 * 60 * 1000, // 5 minutes
  defaultMaxAttempts: 3,
  cleanupIntervalMs: 30 * 1000, // 30 seconds
};

class RunnerCommandQueue {
  private queues: Map<string, QueuedCommand[]> = new Map();
  private options: Required<CommandQueueOptions>;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private sendFunction: ((runnerId: string, command: RunnerCommand) => boolean) | null = null;

  constructor(options: CommandQueueOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.startCleanup();
  }

  /**
   * Set the function used to send commands to runners
   * This is injected to avoid circular dependencies with WebSocket server
   */
  setSendFunction(fn: (runnerId: string, command: RunnerCommand) => boolean) {
    this.sendFunction = fn;
  }

  /**
   * Queue a command for delivery to a runner
   * Returns true if command was sent immediately, false if queued
   */
  enqueue(
    runnerId: string,
    command: RunnerCommand,
    options: {
      ttlMs?: number;
      maxAttempts?: number;
      onSuccess?: () => void;
      onFailure?: (error: string) => void;
    } = {}
  ): { sent: boolean; queued: boolean } {
    const queuedCommand: QueuedCommand = {
      command,
      runnerId,
      queuedAt: Date.now(),
      attempts: 0,
      maxAttempts: options.maxAttempts ?? this.options.defaultMaxAttempts,
      ttlMs: options.ttlMs ?? this.options.defaultTtlMs,
      onSuccess: options.onSuccess,
      onFailure: options.onFailure,
    };

    // Try to send immediately
    if (this.sendFunction) {
      const sent = this.trySend(queuedCommand);
      if (sent) {
        return { sent: true, queued: false };
      }
    }

    // Queue for later delivery
    return this.addToQueue(runnerId, queuedCommand);
  }

  /**
   * Try to send a command, returns true if successful
   */
  private trySend(queuedCommand: QueuedCommand): boolean {
    if (!this.sendFunction) {
      return false;
    }

    queuedCommand.attempts++;
    const sent = this.sendFunction(queuedCommand.runnerId, queuedCommand.command);

    if (sent) {
      buildLogger.log('debug', 'websocket', `[command-queue] Command sent: ${queuedCommand.command.type}`, {
        runnerId: queuedCommand.runnerId,
        commandId: queuedCommand.command.id,
        attempts: queuedCommand.attempts,
      });
      queuedCommand.onSuccess?.();
      return true;
    }

    return false;
  }

  /**
   * Add a command to the queue
   */
  private addToQueue(runnerId: string, queuedCommand: QueuedCommand): { sent: boolean; queued: boolean } {
    let queue = this.queues.get(runnerId);
    
    if (!queue) {
      queue = [];
      this.queues.set(runnerId, queue);
    }

    // Check queue size limit
    if (queue.length >= this.options.maxQueueSize) {
      buildLogger.log('warn', 'websocket', `Queue full for runner ${runnerId}, dropping oldest command`);
      const dropped = queue.shift();
      dropped?.onFailure?.('Queue full - command dropped');
    }

    queue.push(queuedCommand);
    
    buildLogger.log('debug', 'websocket', `Command queued: ${queuedCommand.command.type}`, {
      runnerId,
      commandId: queuedCommand.command.id,
      queueSize: queue.length,
    });

    return { sent: false, queued: true };
  }

  /**
   * Process queued commands for a runner (call when runner connects/reconnects)
   */
  processQueue(runnerId: string): { sent: number; failed: number; remaining: number } {
    const queue = this.queues.get(runnerId);
    if (!queue || queue.length === 0) {
      return { sent: 0, failed: 0, remaining: 0 };
    }

    let sent = 0;
    let failed = 0;
    const remaining: QueuedCommand[] = [];

    for (const queuedCommand of queue) {
      // Check if expired
      if (this.isExpired(queuedCommand)) {
        buildLogger.log('debug', 'websocket', `Command expired: ${queuedCommand.command.type}`, {
          runnerId,
          commandId: queuedCommand.command.id,
        });
        queuedCommand.onFailure?.('Command expired');
        failed++;
        continue;
      }

      // Check max attempts
      if (queuedCommand.attempts >= queuedCommand.maxAttempts) {
        buildLogger.log('debug', 'websocket', `Command max attempts reached: ${queuedCommand.command.type}`, {
          runnerId,
          commandId: queuedCommand.command.id,
          attempts: queuedCommand.attempts,
        });
        queuedCommand.onFailure?.('Max retry attempts reached');
        failed++;
        continue;
      }

      // Try to send
      if (this.trySend(queuedCommand)) {
        sent++;
      } else {
        // Keep in queue for next attempt
        remaining.push(queuedCommand);
      }
    }

    // Update queue with remaining commands
    if (remaining.length > 0) {
      this.queues.set(runnerId, remaining);
    } else {
      this.queues.delete(runnerId);
    }

    buildLogger.log('info', 'websocket', `Processed queue for runner ${runnerId}`, {
      sent,
      failed,
      remaining: remaining.length,
    });

    return { sent, failed, remaining: remaining.length };
  }

  /**
   * Check if a command has expired
   */
  private isExpired(queuedCommand: QueuedCommand): boolean {
    return Date.now() - queuedCommand.queuedAt > queuedCommand.ttlMs;
  }

  /**
   * Start the cleanup interval for expired commands
   */
  private startCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.options.cleanupIntervalMs);
  }

  /**
   * Clean up expired commands from all queues
   */
  private cleanup() {
    for (const [runnerId, queue] of this.queues.entries()) {
      const validCommands = queue.filter(cmd => {
        if (this.isExpired(cmd)) {
          cmd.onFailure?.('Command expired');
          return false;
        }
        return true;
      });

      if (validCommands.length !== queue.length) {
        buildLogger.log('debug', 'websocket', `Cleaned ${queue.length - validCommands.length} expired commands for runner ${runnerId}`);
      }

      if (validCommands.length === 0) {
        this.queues.delete(runnerId);
      } else {
        this.queues.set(runnerId, validCommands);
      }
    }
  }

  /**
   * Get queue stats
   */
  getStats(): { totalQueued: number; runnerQueues: Record<string, number> } {
    const runnerQueues: Record<string, number> = {};
    let totalQueued = 0;

    for (const [runnerId, queue] of this.queues.entries()) {
      runnerQueues[runnerId] = queue.length;
      totalQueued += queue.length;
    }

    return { totalQueued, runnerQueues };
  }

  /**
   * Clear all queued commands for a runner
   */
  clearQueue(runnerId: string): number {
    const queue = this.queues.get(runnerId);
    const count = queue?.length ?? 0;
    
    if (queue) {
      for (const cmd of queue) {
        cmd.onFailure?.('Queue cleared');
      }
    }
    
    this.queues.delete(runnerId);
    return count;
  }

  /**
   * Shutdown the queue (cleanup interval)
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
export const commandQueue = new RunnerCommandQueue();

export type { QueuedCommand, CommandQueueOptions };
