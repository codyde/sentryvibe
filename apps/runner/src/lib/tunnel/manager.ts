import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { ensureCloudflared } from './auto-install.js';

interface TunnelInfo {
  url: string;
  port: number;
  process: ChildProcess;
}

export class TunnelManager extends EventEmitter {
  private tunnels = new Map<number, TunnelInfo>();
  private cloudflaredPath: string | null = null;

  /**
   * Create a tunnel for a specific port
   * Returns the public tunnel URL
   */
  async createTunnel(port: number, maxRetries = 5): Promise<string> {
    // Check if tunnel already exists for this port
    if (this.tunnels.has(port)) {
      const existing = this.tunnels.get(port)!;
      console.log(`🔗 Tunnel already exists for port ${port}: ${existing.url}`);
      return existing.url;
    }

    // Ensure cloudflared is installed
    if (!this.cloudflaredPath) {
      this.cloudflaredPath = await ensureCloudflared();
    }

    // Try creating tunnel with smart retries
    const errors: string[] = [];
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this._createTunnelAttempt(port);
      } catch (error: any) {
        const errorMsg = error?.message || String(error);
        errors.push(errorMsg);
        console.error(`Tunnel creation attempt ${attempt}/${maxRetries} failed:`, errorMsg);

        // Check if this is a permanent error (fail fast)
        if (this._isPermanentError(errorMsg)) {
          throw new Error(`Permanent failure: ${errorMsg}`);
        }

        if (attempt === maxRetries) {
          throw new Error(`Failed to create tunnel after ${maxRetries} attempts: ${errors.join('; ')}`);
        }

        // Exponential backoff with jitter to prevent thundering herd
        const baseDelay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s, 16s
        const jitter = Math.random() * 1000; // 0-1s random jitter
        const delay = baseDelay + jitter;
        console.log(`Retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('Tunnel creation failed after all retries');
  }

  /**
   * Check if an error is permanent (no point retrying)
   */
  private _isPermanentError(errorMsg: string): boolean {
    const permanentErrors = [
      'port already in use',
      'cloudflared not found',
      'permission denied',
      'cannot find',
      'enoent',
      'eacces',
    ];

    const lowerMsg = errorMsg.toLowerCase();
    return permanentErrors.some(err => lowerMsg.includes(err));
  }

  /**
   * Extract tunnel URL from cloudflared output
   */
  private _extractTunnelUrl(output: string): string | null {
    // Format: "Your quick Tunnel has been created! Visit it at: https://xxx.trycloudflare.com"
    // Or just: "https://xxx.trycloudflare.com"
    const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    return match ? match[0] : null;
  }

  /**
   * Verify tunnel is actually responding (async, non-blocking)
   * This runs in background and only logs results
   */
  private async _verifyTunnelReady(url: string, maxWaitMs = 15000): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 1000; // Check every 1 second (less aggressive)

    console.log(`🔍 [Background] Verifying tunnel is ready: ${url}`);

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Any response (even errors) means tunnel is connected
        // We just need to verify it's resolving and routing
        if (response.status < 500 || response.ok) {
          const elapsed = Date.now() - startTime;
          console.log(`✅ [Background] Tunnel verified in ${elapsed}ms`);
          return true;
        }
      } catch (error) {
        // Expected while DNS propagates or tunnel initializes
        // Will keep retrying silently
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    console.log(`⏱️  [Background] Verification timeout after ${maxWaitMs}ms (tunnel may still work)`);
    return false;
  }

  /**
   * Single attempt to create a tunnel
   */
  private async _createTunnelAttempt(port: number): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log(`[tunnel] Creating tunnel for port ${port}...`);

      // Direct binary execution with unbuffered streams
      const proc = spawn(this.cloudflaredPath!, [
        'tunnel',
        '--url', `http://localhost:${port}`,
        '--no-autoupdate',
      ], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Set streams to unbuffered mode immediately for responsive output
      if (proc.stdout) {
        proc.stdout.setEncoding('utf8');
        proc.stdout.resume();
      }
      if (proc.stderr) {
        proc.stderr.setEncoding('utf8');
        proc.stderr.resume();
      }

      console.log(`[tunnel] Cloudflared spawned with PID: ${proc.pid}`);

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          proc.kill();
          reject(new Error('Tunnel creation timeout (30s)'));
        }
      }, 30000);

      // Shared handler for both stdout and stderr
      const handleOutput = async (data: Buffer) => {
        const output = data.toString();
        const url = this._extractTunnelUrl(output);

        if (url && !resolved) {
          resolved = true;
          clearTimeout(timeout);

          this.tunnels.set(port, { url, port, process: proc });

          console.log(`✅ Tunnel URL received: ${url} → localhost:${port}`);
          console.log(`✅ Tunnel ready: ${url}`);

          // Note: Backend verification skipped for localhost tunnels
          // The tunnel connects localhost to Cloudflare - backend can't verify it
          // Frontend will verify DNS before loading in iframe

          resolve(url);
        }
      };

      proc.stdout.on('data', handleOutput);

      proc.stderr.on('data', (data: Buffer) => {
        const output = data.toString();

        // Log errors (cloudflared uses stderr for all output)
        if (output.toLowerCase().includes('error') || output.toLowerCase().includes('fatal')) {
          console.error(`[cloudflared:${port}] ${output.trim()}`);
        }

        // Check for tunnel URL in stderr too
        handleOutput(data);
      });

      proc.on('exit', (code, signal) => {
        console.log(`Tunnel exited for port ${port} with code ${code} signal ${signal}`);
        this.tunnels.delete(port);
        this.emit('tunnel-closed', port);
      });

      proc.on('error', (error) => {
        if (!resolved) {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  /**
   * Close tunnel for a specific port
   */
  async closeTunnel(port: number): Promise<void> {
    const tunnel = this.tunnels.get(port);
    if (!tunnel) {
      console.log(`No tunnel found for port ${port}`);
      return;
    }

    console.log(`🔗 Closing tunnel for port ${port}...`);
    tunnel.process.kill('SIGTERM');
    this.tunnels.delete(port);
  }

  /**
   * Close all active tunnels
   */
  async closeAll(): Promise<void> {
    console.log(`🔗 Closing ${this.tunnels.size} active tunnel(s)...`);

    const ports = Array.from(this.tunnels.keys());
    await Promise.all(ports.map(port => this.closeTunnel(port)));
  }

  /**
   * Get tunnel URL for a specific port (if exists)
   */
  getTunnelUrl(port: number): string | null {
    const tunnel = this.tunnels.get(port);
    return tunnel ? tunnel.url : null;
  }

  /**
   * Get all active tunnels
   */
  getActiveTunnels(): Array<{ port: number; url: string }> {
    return Array.from(this.tunnels.values()).map(({ port, url }) => ({ port, url }));
  }
}

// Singleton instance
export const tunnelManager = new TunnelManager();
