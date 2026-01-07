/**
 * HMR Proxy Manager for Server-Side (SaaS) WebSocket Connection
 * 
 * This manager runs on the Next.js server and coordinates HMR message flow:
 * 
 * Flow:
 * 1. Browser iframe sends HMR message via postMessage to parent
 * 2. PreviewPanel receives and sends via WebSocket to server
 * 3. Server (this manager) forwards to runner via existing WS connection
 * 4. Runner connects to actual Vite HMR WebSocket and relays messages
 * 5. Vite HMR messages flow back through the same path
 * 
 * This is the server-side counterpart to:
 * - Runner's hmr-proxy-manager.ts (connects to actual Vite HMR)
 * - Browser's HMR injection script (intercepts WebSocket in iframe)
 */

import { randomUUID } from 'node:crypto';
import type {
  HmrConnectCommand,
  HmrMessageCommand,
  HmrDisconnectCommand,
  HmrConnectedEvent,
  HmrMessageEvent,
  HmrDisconnectedEvent,
  HmrErrorEvent,
  RunnerEvent,
} from '../../shared/runner/messages';
import { buildWebSocketServer } from './server';

// Connection timeout (30 seconds to establish connection)
const CONNECTION_TIMEOUT_MS = 30000;

interface PendingHmrConnection {
  projectId: string;
  runnerId: string;
  port: number;
  protocol?: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  createdAt: number;
  // Callbacks for when messages arrive from runner
  onMessage?: (message: string) => void;
  onConnected?: () => void;
  onDisconnected?: (code?: number, reason?: string) => void;
  onError?: (error: string) => void;
}

class HmrProxyManager {
  // Map connectionId -> pending connection info
  private connections = new Map<string, PendingHmrConnection>();

  /**
   * Initiate an HMR connection through the runner
   * 
   * @param connectionId - Connection ID from frontend (must be preserved for message correlation)
   * @returns connectionId to track this connection
   */
  connect(
    connectionId: string,
    runnerId: string,
    projectId: string,
    port: number,
    protocol?: string,
    callbacks?: {
      onMessage?: (message: string) => void;
      onConnected?: () => void;
      onDisconnected?: (code?: number, reason?: string) => void;
      onError?: (error: string) => void;
    }
  ): string {
    // Use the connectionId from the frontend - DO NOT generate a new one
    // This is critical for message correlation

    // Check if runner is connected
    if (!buildWebSocketServer.isRunnerConnected(runnerId)) {
      console.warn(`[hmr-proxy] Runner ${runnerId} is not connected`);
      callbacks?.onError?.('Runner not connected');
      return connectionId;
    }

    // Store connection info
    this.connections.set(connectionId, {
      projectId,
      runnerId,
      port,
      protocol,
      status: 'connecting',
      createdAt: Date.now(),
      ...callbacks,
    });

    // Set up timeout for connection
    setTimeout(() => {
      const conn = this.connections.get(connectionId);
      if (conn && conn.status === 'connecting') {
        console.warn(`[hmr-proxy] Connection timeout for ${connectionId}`);
        conn.status = 'error';
        conn.onError?.('Connection timeout');
        this.connections.delete(connectionId);
      }
    }, CONNECTION_TIMEOUT_MS);

    // Send connect command to runner
    const command: HmrConnectCommand = {
      id: randomUUID(),
      type: 'hmr-connect',
      projectId,
      timestamp: new Date().toISOString(),
      payload: {
        connectionId,
        port,
        protocol,
      },
    };

    const sent = buildWebSocketServer.sendCommandToRunner(runnerId, command);
    if (!sent) {
      console.error(`[hmr-proxy] Failed to send HMR connect to runner ${runnerId}`);
      this.connections.delete(connectionId);
      callbacks?.onError?.('Failed to send connect command');
    }

    return connectionId;
  }

  /**
   * Send an HMR message through the connection
   */
  send(connectionId: string, message: string): boolean {
    const conn = this.connections.get(connectionId);
    if (!conn) {
      console.warn(`[hmr-proxy] No connection found for ${connectionId}`);
      return false;
    }

    if (conn.status !== 'connected') {
      console.warn(`[hmr-proxy] Connection ${connectionId} not ready (${conn.status})`);
      return false;
    }

    const command: HmrMessageCommand = {
      id: randomUUID(),
      type: 'hmr-message',
      projectId: conn.projectId,
      timestamp: new Date().toISOString(),
      payload: {
        connectionId,
        message,
      },
    };

    return buildWebSocketServer.sendCommandToRunner(conn.runnerId, command);
  }

  /**
   * Disconnect an HMR connection
   */
  disconnect(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (!conn) {
      return;
    }



    const command: HmrDisconnectCommand = {
      id: randomUUID(),
      type: 'hmr-disconnect',
      projectId: conn.projectId,
      timestamp: new Date().toISOString(),
      payload: {
        connectionId,
      },
    };

    buildWebSocketServer.sendCommandToRunner(conn.runnerId, command);
    this.connections.delete(connectionId);
  }

  /**
   * Handle HMR events from runner
   */
  handleConnected(event: HmrConnectedEvent): void {
    const conn = this.connections.get(event.connectionId);
    if (!conn) {
      console.warn(`[hmr-proxy] Received connected for unknown connection: ${event.connectionId}`);
      return;
    }


    conn.status = 'connected';
    conn.onConnected?.();
  }

  handleMessage(event: HmrMessageEvent): void {
    const conn = this.connections.get(event.connectionId);
    if (!conn) {
      console.warn(`[hmr-proxy] Received message for unknown connection: ${event.connectionId}`);
      return;
    }

    conn.onMessage?.(event.message);
  }

  handleDisconnected(event: HmrDisconnectedEvent): void {
    const conn = this.connections.get(event.connectionId);
    if (!conn) {
      console.warn(`[hmr-proxy] Received disconnected for unknown connection: ${event.connectionId}`);
      return;
    }


    conn.status = 'disconnected';
    conn.onDisconnected?.(event.code, event.reason);
    this.connections.delete(event.connectionId);
  }

  handleError(event: HmrErrorEvent): void {
    const conn = this.connections.get(event.connectionId);
    if (!conn) {
      console.warn(`[hmr-proxy] Received error for unknown connection: ${event.connectionId}`);
      return;
    }

    console.error(`[hmr-proxy] HMR error for ${event.connectionId}: ${event.error}`);
    conn.status = 'error';
    conn.onError?.(event.error);
    this.connections.delete(event.connectionId);
  }

  /**
   * Process a runner event and handle HMR events
   * @returns true if the event was an HMR event and was handled
   */
  processEvent(event: RunnerEvent): boolean {
    switch (event.type) {
      case 'hmr-connected':
        this.handleConnected(event as HmrConnectedEvent);
        return true;
      case 'hmr-message':
        this.handleMessage(event as HmrMessageEvent);
        return true;
      case 'hmr-disconnected':
        this.handleDisconnected(event as HmrDisconnectedEvent);
        return true;
      case 'hmr-error':
        this.handleError(event as HmrErrorEvent);
        return true;
      default:
        return false;
    }
  }

  /**
   * Disconnect all HMR connections for a project
   */
  disconnectProject(projectId: string): void {
    for (const [connectionId, conn] of this.connections.entries()) {
      if (conn.projectId === projectId) {
        this.disconnect(connectionId);
      }
    }
  }

  /**
   * Disconnect all HMR connections for a runner (e.g., on runner disconnect)
   */
  disconnectRunner(runnerId: string): void {
    for (const [connectionId, conn] of this.connections.entries()) {
      if (conn.runnerId === runnerId) {

        conn.onDisconnected?.(1001, 'Runner disconnected');
        this.connections.delete(connectionId);
      }
    }
  }

  /**
   * Get connection by ID
   */
  getConnection(connectionId: string): PendingHmrConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get stats about active connections
   */
  getStats() {
    return {
      activeConnections: this.connections.size,
      connectionsByProject: Array.from(this.connections.values())
        .reduce((acc, conn) => {
          acc[conn.projectId] = (acc[conn.projectId] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      connectionsByStatus: Array.from(this.connections.values())
        .reduce((acc, conn) => {
          acc[conn.status] = (acc[conn.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
    };
  }
}

// Use globalThis to ensure true singleton across module reloads
const globalKey = '__hmrProxyManager__';

function getOrCreateManager(): HmrProxyManager {
  if (!(globalThis as any)[globalKey]) {
    (globalThis as any)[globalKey] = new HmrProxyManager();
  }
  return (globalThis as any)[globalKey];
}

// Singleton instance
export const hmrProxyManager = getOrCreateManager();
