/**
 * ServiceManager - Manages lifecycle and state of Web App, Broker, and Runner
 * Provides state updates for TUI dashboard
 */

import { spawn, ChildProcess } from 'child_process';
import EventEmitter from 'events';

export type ServiceName = 'web' | 'broker' | 'runner';
export type ServiceStatus = 'stopped' | 'starting' | 'running' | 'error';

export interface ServiceConfig {
  name: ServiceName;
  displayName: string;
  port?: number;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

export interface ServiceState {
  name: ServiceName;
  displayName: string;
  status: ServiceStatus;
  port?: number;
  uptime: number; // milliseconds
  memory?: number; // bytes
  cpu?: number; // percentage
  pid?: number;
  error?: string;
  lastOutput?: string;
  tunnelUrl?: string; // Cloudflare tunnel URL
  tunnelStatus?: 'creating' | 'active' | 'failed';
}

export interface ServiceManagerEvents {
  'service:status-change': (name: ServiceName, status: ServiceStatus) => void;
  'service:output': (name: ServiceName, output: string, stream: 'stdout' | 'stderr') => void;
  'service:error': (name: ServiceName, error: Error) => void;
  'service:tunnel-change': (name: ServiceName, tunnelUrl: string | null, status: 'creating' | 'active' | 'failed') => void;
  'all:started': () => void;
  'all:stopped': () => void;
}

export declare interface ServiceManager {
  on<K extends keyof ServiceManagerEvents>(
    event: K,
    listener: ServiceManagerEvents[K]
  ): this;
  emit<K extends keyof ServiceManagerEvents>(
    event: K,
    ...args: Parameters<ServiceManagerEvents[K]>
  ): boolean;
}

export class ServiceManager extends EventEmitter {
  private services = new Map<ServiceName, {
    config: ServiceConfig;
    process?: ChildProcess;
    state: ServiceState;
    startTime?: number;
  }>();

  private updateInterval?: NodeJS.Timeout;

  constructor() {
    super();
  }

  /**
   * Register a service configuration
   */
  register(config: ServiceConfig): void {
    this.services.set(config.name, {
      config,
      state: {
        name: config.name,
        displayName: config.displayName,
        status: 'stopped',
        port: config.port,
        uptime: 0,
      },
    });
  }

  /**
   * Start a specific service
   */
  async start(name: ServiceName): Promise<void> {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} not registered`);
    }

    if (service.process && !service.process.killed) {
      throw new Error(`Service ${name} is already running`);
    }

    // Update state to starting
    service.state.status = 'starting';
    this.emit('service:status-change', name, 'starting');

    try {
      // Spawn the process
      const proc = spawn(service.config.command, service.config.args, {
        cwd: service.config.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        env: {
          ...process.env,
          ...service.config.env,
        },
      });

      service.process = proc;
      service.state.pid = proc.pid;
      service.startTime = Date.now();

      // Handle stdout
      proc.stdout?.on('data', (data) => {
        const output = data.toString();
        service.state.lastOutput = output.trim();
        this.emit('service:output', name, output, 'stdout');

        // Detect when service is ready
        if (this.isServiceReady(name, output)) {
          service.state.status = 'running';
          this.emit('service:status-change', name, 'running');
        }
      });

      // Handle stderr
      proc.stderr?.on('data', (data) => {
        const output = data.toString();
        this.emit('service:output', name, output, 'stderr');

        // Check for errors in stderr
        if (output.toLowerCase().includes('error') && !output.includes('warn')) {
          service.state.error = output.trim();
        }
      });

      // Handle process exit
      proc.on('exit', (code, signal) => {
        if (code !== 0 && code !== null && code !== 130 && code !== 143) {
          // Abnormal exit
          service.state.status = 'error';
          service.state.error = `Exited with code ${code}`;
          this.emit('service:status-change', name, 'error');
          this.emit('service:error', name, new Error(`Process exited with code ${code}`));
        } else {
          // Normal exit
          service.state.status = 'stopped';
          this.emit('service:status-change', name, 'stopped');
        }
        service.process = undefined;
        service.state.pid = undefined;
        service.startTime = undefined;
      });

      proc.on('error', (error) => {
        service.state.status = 'error';
        service.state.error = error.message;
        this.emit('service:status-change', name, 'error');
        this.emit('service:error', name, error);
      });

    } catch (error) {
      service.state.status = 'error';
      service.state.error = error instanceof Error ? error.message : 'Unknown error';
      this.emit('service:status-change', name, 'error');
      this.emit('service:error', name, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Start all registered services in sequence
   */
  async startAll(delayBetween: number = 2000): Promise<void> {
    const services = Array.from(this.services.keys());

    for (const name of services) {
      await this.start(name);
      if (delayBetween > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetween));
      }
    }

    // Start periodic updates for uptime/stats
    this.startUpdates();

    this.emit('all:started');
  }

  /**
   * Stop a specific service
   */
  async stop(name: ServiceName, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
    const service = this.services.get(name);
    if (!service || !service.process) {
      return;
    }

    return new Promise((resolve) => {
      const proc = service.process!;

      // Set timeout for force kill
      const timeout = setTimeout(() => {
        if (!proc.killed) {
          proc.kill('SIGKILL');
        }
        resolve();
      }, 2000);

      proc.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      proc.kill(signal);
    });
  }

  /**
   * Stop all running services
   */
  async stopAll(): Promise<void> {
    this.stopUpdates();

    const services = Array.from(this.services.keys()).reverse(); // Stop in reverse order
    for (const name of services) {
      await this.stop(name);
    }

    this.emit('all:stopped');
  }

  /**
   * Get current state of a service
   */
  getState(name: ServiceName): ServiceState | undefined {
    return this.services.get(name)?.state;
  }

  /**
   * Get current state of all services
   */
  getAllStates(): ServiceState[] {
    return Array.from(this.services.values()).map(s => s.state);
  }

  /**
   * Check if a service is running
   */
  isRunning(name: ServiceName): boolean {
    return this.services.get(name)?.state.status === 'running';
  }

  /**
   * Check if all services are running
   */
  areAllRunning(): boolean {
    return Array.from(this.services.values()).every(s => s.state.status === 'running');
  }

  /**
   * Restart a service
   */
  async restart(name: ServiceName): Promise<void> {
    await this.stop(name);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.start(name);
  }

  /**
   * Restart all services
   */
  async restartAll(): Promise<void> {
    await this.stopAll();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.startAll();
  }

  /**
   * Start periodic state updates (uptime, memory, cpu)
   */
  private startUpdates(): void {
    this.updateInterval = setInterval(() => {
      for (const [name, service] of this.services) {
        if (service.startTime) {
          service.state.uptime = Date.now() - service.startTime;
        }

        // TODO: Add memory/CPU monitoring using ps or similar
        // For now, just update uptime
      }
    }, 1000); // Update every second
  }

  /**
   * Stop periodic updates
   */
  private stopUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }
  }

  /**
   * Detect if service is ready based on output
   */
  private isServiceReady(name: ServiceName, output: string): boolean {
    const lowerOutput = output.toLowerCase();

    switch (name) {
      case 'web':
        return lowerOutput.includes('ready') || lowerOutput.includes('started server');
      case 'broker':
        return lowerOutput.includes('listening') || lowerOutput.includes('ready');
      case 'runner':
        return lowerOutput.includes('connected') || lowerOutput.includes('ready');
      default:
        return false;
    }
  }

  /**
   * Create a Cloudflare tunnel for a service
   */
  async createTunnel(name: ServiceName): Promise<string | null> {
    const service = this.services.get(name);
    if (!service || !service.state.port) {
      throw new Error(`Service ${name} not found or has no port`);
    }

    // Update state to creating
    service.state.tunnelStatus = 'creating';
    this.emit('service:tunnel-change', name, null, 'creating');

    try {
      // Import tunnel manager
      const { tunnelManager } = await import('../../lib/tunnel/manager.js');

      // Create tunnel
      const tunnelUrl = await tunnelManager.createTunnel(service.state.port);

      // Update state
      service.state.tunnelUrl = tunnelUrl;
      service.state.tunnelStatus = 'active';
      this.emit('service:tunnel-change', name, tunnelUrl, 'active');

      return tunnelUrl;
    } catch (error) {
      service.state.tunnelStatus = 'failed';
      service.state.error = error instanceof Error ? error.message : 'Tunnel creation failed';
      this.emit('service:tunnel-change', name, null, 'failed');
      return null;
    }
  }

  /**
   * Close tunnel for a service
   */
  async closeTunnel(name: ServiceName): Promise<void> {
    const service = this.services.get(name);
    if (!service || !service.state.port) {
      return;
    }

    try {
      const { tunnelManager } = await import('../../lib/tunnel/manager.js');
      await tunnelManager.closeTunnel(service.state.port);

      service.state.tunnelUrl = undefined;
      service.state.tunnelStatus = undefined;
      this.emit('service:tunnel-change', name, null, 'active');
    } catch (error) {
      // Best effort
    }
  }

  /**
   * Get tunnel URL for a service
   */
  getTunnelUrl(name: ServiceName): string | null {
    return this.services.get(name)?.state.tunnelUrl || null;
  }

  /**
   * Cleanup and remove all listeners
   */
  destroy(): void {
    this.stopUpdates();
    this.removeAllListeners();
  }
}
