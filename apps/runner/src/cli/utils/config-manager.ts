import Conf from 'conf';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';

export interface RunnerConfig {
  version: string;
  workspace: string;
  monorepoPath?: string; // Path to cloned sentryvibe repository
  databaseUrl?: string; // PostgreSQL connection string
  broker: {
    url: string;
    secret: string;
  };
  runner: {
    id: string;
    reconnectAttempts?: number;
    heartbeatInterval?: number;
  };
  tunnel?: {
    provider: 'cloudflare';
    autoCreate: boolean;
  };
}

/**
 * Config manager using conf library
 * Handles platform-specific config locations
 */
export class ConfigManager {
  private conf: Conf<RunnerConfig>;

  constructor() {
    this.conf = new Conf<RunnerConfig>({
      projectName: 'sentryvibe',
      projectSuffix: '', // No suffix, just 'sentryvibe'
      defaults: this.getDefaults(),
    });
  }

  private getDefaults(): RunnerConfig {
    return {
      version: '0.1.0',
      workspace: join(homedir(), 'sentryvibe-workspace'),
      broker: {
        url: 'ws://localhost:4000/socket', // Default to local broker
        secret: 'dev-secret', // Default local secret
      },
      runner: {
        id: 'local',
        reconnectAttempts: 5,
        heartbeatInterval: 15000,
      },
      tunnel: {
        provider: 'cloudflare',
        autoCreate: true,
      },
    };
  }

  get(key?: keyof RunnerConfig): any {
    if (!key) {
      return this.conf.store;
    }
    return this.conf.get(key);
  }

  set(key: keyof RunnerConfig | string, value: any): void {
    this.conf.set(key as any, value);
  }

  delete(key: keyof RunnerConfig): void {
    this.conf.delete(key);
  }

  reset(): void {
    this.conf.clear();
    this.conf.store = this.getDefaults();
  }

  has(key: keyof RunnerConfig): boolean {
    return this.conf.has(key);
  }

  get path(): string {
    return this.conf.path;
  }

  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const config = this.conf.store;

    if (!config.workspace) {
      errors.push('Workspace path is required');
    }

    if (!config.broker?.secret) {
      errors.push('Broker shared secret is required');
    }

    if (!config.broker?.url) {
      errors.push('Broker URL is required');
    }

    if (!config.runner?.id) {
      errors.push('Runner ID is required');
    }

    // Check if workspace exists
    if (config.workspace && !existsSync(config.workspace)) {
      errors.push(`Workspace directory does not exist: ${config.workspace}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if config has been initialized (secret is set)
   */
  isInitialized(): boolean {
    const broker = this.get('broker');
    return !!(broker && typeof broker === 'object' && 'secret' in broker && broker.secret);
  }
}

export const configManager = new ConfigManager();
