/**
 * HMR Proxy Manager for Runner
 * 
 * Manages WebSocket connections to local Vite/webpack HMR servers
 * and forwards messages through the main runner WebSocket connection.
 */

import WebSocket from 'ws';

export interface HmrConnection {
  id: string;
  port: number;
  protocol?: string;
  ws: WebSocket;
  projectId: string;
}

type MessageCallback = (connectionId: string, message: string) => void;
type ConnectedCallback = (connectionId: string) => void;
type DisconnectedCallback = (connectionId: string, code?: number, reason?: string) => void;
type ErrorCallback = (connectionId: string, error: string) => void;

class HmrProxyManager {
  private connections = new Map<string, HmrConnection>();
  private onMessage: MessageCallback | null = null;
  private onConnected: ConnectedCallback | null = null;
  private onDisconnected: DisconnectedCallback | null = null;
  private onError: ErrorCallback | null = null;

  /**
   * Set callbacks for HMR events
   */
  setCallbacks(callbacks: {
    onMessage: MessageCallback;
    onConnected: ConnectedCallback;
    onDisconnected: DisconnectedCallback;
    onError: ErrorCallback;
  }) {
    this.onMessage = callbacks.onMessage;
    this.onConnected = callbacks.onConnected;
    this.onDisconnected = callbacks.onDisconnected;
    this.onError = callbacks.onError;
  }

  /**
   * Connect to a local HMR WebSocket server
   */
  connect(connectionId: string, port: number, projectId: string, protocol?: string): void {
    // Close existing connection if any
    this.disconnect(connectionId);

    const wsUrl = `ws://localhost:${port}`;
    console.log(`[hmr-proxy] Connecting to HMR server: ${wsUrl} (protocol: ${protocol || 'none'})`);

    try {
      const ws = protocol 
        ? new WebSocket(wsUrl, protocol)
        : new WebSocket(wsUrl);

      const connection: HmrConnection = {
        id: connectionId,
        port,
        protocol,
        ws,
        projectId,
      };

      ws.on('open', () => {
        console.log(`[hmr-proxy] Connected to HMR server on port ${port}`);
        this.connections.set(connectionId, connection);
        this.onConnected?.(connectionId);
      });

      ws.on('message', (data: WebSocket.Data) => {
        const message = data.toString();
        // Don't log every message to avoid spam, but log important ones
        try {
          const parsed = JSON.parse(message);
          if (parsed.type && parsed.type !== 'ping') {
            console.log(`[hmr-proxy] HMR message (${parsed.type}): ${message.substring(0, 100)}...`);
          }
        } catch {
          // Not JSON, just forward it
        }
        this.onMessage?.(connectionId, message);
      });

      ws.on('close', (code, reason) => {
        console.log(`[hmr-proxy] HMR connection closed: ${code} ${reason}`);
        this.connections.delete(connectionId);
        this.onDisconnected?.(connectionId, code, reason.toString());
      });

      ws.on('error', (error) => {
        console.error(`[hmr-proxy] HMR WebSocket error:`, error);
        this.onError?.(connectionId, error.message);
      });

      // Store connection even before open (in case we need to close it)
      this.connections.set(connectionId, connection);

    } catch (error) {
      console.error(`[hmr-proxy] Failed to create WebSocket:`, error);
      this.onError?.(connectionId, error instanceof Error ? error.message : 'Failed to connect');
    }
  }

  /**
   * Send a message to the HMR server
   */
  send(connectionId: string, message: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      console.warn(`[hmr-proxy] No connection found for ${connectionId}`);
      return false;
    }

    if (connection.ws.readyState !== WebSocket.OPEN) {
      console.warn(`[hmr-proxy] WebSocket not open for ${connectionId}, state: ${connection.ws.readyState}`);
      return false;
    }

    try {
      connection.ws.send(message);
      return true;
    } catch (error) {
      console.error(`[hmr-proxy] Failed to send message:`, error);
      return false;
    }
  }

  /**
   * Disconnect from HMR server
   */
  disconnect(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      console.log(`[hmr-proxy] Disconnecting HMR connection ${connectionId}`);
      try {
        connection.ws.close();
      } catch (error) {
        // Ignore close errors
      }
      this.connections.delete(connectionId);
    }
  }

  /**
   * Disconnect all HMR connections for a project
   */
  disconnectProject(projectId: string): void {
    for (const [connectionId, connection] of this.connections.entries()) {
      if (connection.projectId === projectId) {
        this.disconnect(connectionId);
      }
    }
  }

  /**
   * Disconnect all HMR connections
   */
  disconnectAll(): void {
    for (const connectionId of this.connections.keys()) {
      this.disconnect(connectionId);
    }
  }

  /**
   * Check if a connection exists and is open
   */
  isConnected(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    return connection?.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get stats about active connections
   */
  getStats() {
    return {
      activeConnections: this.connections.size,
      connections: Array.from(this.connections.values()).map(c => ({
        id: c.id,
        port: c.port,
        projectId: c.projectId,
        readyState: c.ws.readyState,
      })),
    };
  }
}

// Export singleton instance
export const hmrProxyManager = new HmrProxyManager();
