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
  async createTunnel(port: number, retries = 3): Promise<string> {
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

    // Try creating tunnel with retries
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this._createTunnelAttempt(port);
      } catch (error) {
        console.error(`Tunnel creation attempt ${attempt}/${retries} failed:`, error);

        if (attempt === retries) {
          throw new Error(`Failed to create tunnel after ${retries} attempts: ${error}`);
        }

        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('Tunnel creation failed after all retries');
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

      proc.stdout.on('data', (data: Buffer) => {
        const output = data.toString();

        // Parse tunnel URL from output
        // Format: "Your quick Tunnel has been created! Visit it at: https://xxx.trycloudflare.com"
        // Or: "https://xxx.trycloudflare.com"
        const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);

        if (match && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          const url = match[0];

          this.tunnels.set(port, { url, port, process: proc });

          console.log(`✅ Tunnel URL received: ${url} → localhost:${port}`);
          console.log(`⏳ Waiting 5 seconds for tunnel to stabilize and DNS to propagate...`);

          // Add a 5-second delay to ensure tunnel is fully established and DNS propagated
          setTimeout(() => {
            console.log(`✅ Tunnel ready: ${url}`);
            resolve(url);
          }, 5000);
        }
      });

      proc.stderr.on('data', (data: Buffer) => {
        const output = data.toString();

        // Log errors only (cloudflared uses stderr for all output)
        if (output.toLowerCase().includes('error') || output.toLowerCase().includes('fatal')) {
          console.error(`[cloudflared:${port}] ${output.trim()}`);
        }

        // Check stderr for tunnel URL (cloudflared outputs URL to stderr)
        const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          const url = match[0];

          this.tunnels.set(port, { url, port, process: proc });

          console.log(`✅ Tunnel URL received: ${url} → localhost:${port}`);
          console.log(`⏳ Waiting 5 seconds for tunnel to stabilize and DNS to propagate...`);

          // Add a 5-second delay to ensure tunnel is fully established and DNS propagated
          setTimeout(() => {
            console.log(`✅ Tunnel ready: ${url}`);
            resolve(url);
          }, 5000);
        }
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
