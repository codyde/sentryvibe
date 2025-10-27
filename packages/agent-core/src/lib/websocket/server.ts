/**
 * WebSocket Server for Real-Time Build Updates
 * 
 * Provides real-time state synchronization without SSE's connection fragility.
 * Clients can:
 * - Subscribe to project/session updates
 * - Receive batched state changes
 * - Auto-reconnect on disconnect
 * - Resume from last known state
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { GenerationState } from '../../types/generation';

interface ClientSubscription {
  ws: WebSocket;
  projectId: string;
  sessionId?: string;
  lastHeartbeat: number;
}

interface StateUpdateMessage {
  type: 'state-update';
  projectId: string;
  sessionId: string;
  state: Partial<GenerationState>;
  timestamp: number;
}

interface BatchedUpdate {
  projectId: string;
  sessionId: string;
  updates: Array<{
    type: string;
    data: unknown;
    timestamp: number;
  }>;
}

class BuildWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientSubscription> = new Map();
  private pendingUpdates: Map<string, BatchedUpdate> = new Map();
  private batchInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  
  private readonly BATCH_DELAY = 200; // ms - batch updates for efficiency
  private readonly HEARTBEAT_INTERVAL = 30000; // 30s
  private readonly CLIENT_TIMEOUT = 60000; // 60s

  /**
   * Initialize WebSocket server
   */
  initialize(server: Server, path: string = '/ws') {
    console.log('[WebSocket] Initializing server...');
    
    this.wss = new WebSocketServer({ 
      server,
      path,
      perMessageDeflate: false, // Disable compression for lower latency
    });

    this.wss.on('connection', (ws: WebSocket, req) => {
      this.handleConnection(ws, req);
    });

    // Start batch processing interval
    this.batchInterval = setInterval(() => {
      this.processBatchedUpdates();
    }, this.BATCH_DELAY);

    // Start heartbeat interval
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeats();
    }, this.HEARTBEAT_INTERVAL);

    console.log(`[WebSocket] Server initialized on path: ${path}`);
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: any) {
    const clientId = this.generateClientId();
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const projectId = url.searchParams.get('projectId') || '';
    const sessionId = url.searchParams.get('sessionId') || undefined;

    console.log(`[WebSocket] Client connected: ${clientId}`, { projectId, sessionId });

    // Store client subscription
    this.clients.set(clientId, {
      ws,
      projectId,
      sessionId,
      lastHeartbeat: Date.now(),
    });

    // Send connection confirmation
    this.sendMessage(ws, {
      type: 'connected',
      clientId,
      projectId,
      sessionId,
      timestamp: Date.now(),
    });

    // Handle messages from client
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleClientMessage(clientId, message);
      } catch (error) {
        console.error('[WebSocket] Failed to parse client message:', error);
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      console.log(`[WebSocket] Client disconnected: ${clientId}`);
      this.clients.delete(clientId);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`[WebSocket] Client error: ${clientId}`, error);
      this.clients.delete(clientId);
    });
  }

  /**
   * Handle messages from client (heartbeat, resubscribe, etc.)
   */
  private handleClientMessage(clientId: string, message: any) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'heartbeat':
        client.lastHeartbeat = Date.now();
        this.sendMessage(client.ws, { type: 'heartbeat-ack', timestamp: Date.now() });
        break;
      
      case 'subscribe':
        // Update subscription
        client.projectId = message.projectId;
        client.sessionId = message.sessionId;
        console.log(`[WebSocket] Client ${clientId} subscribed to project: ${message.projectId}`);
        break;
      
      case 'get-state':
        // Client requesting current state (on reconnect)
        this.sendCurrentState(client);
        break;
    }
  }

  /**
   * Broadcast state update to subscribed clients
   */
  broadcastStateUpdate(projectId: string, sessionId: string, state: Partial<GenerationState>) {
    const key = `${projectId}-${sessionId}`;
    
    // Add to pending updates for batching
    if (!this.pendingUpdates.has(key)) {
      this.pendingUpdates.set(key, {
        projectId,
        sessionId,
        updates: [],
      });
    }

    const batch = this.pendingUpdates.get(key)!;
    batch.updates.push({
      type: 'state-update',
      data: state,
      timestamp: Date.now(),
    });

    // If batch is getting large, flush immediately
    if (batch.updates.length >= 10) {
      this.flushBatch(key);
    }
  }

  /**
   * Broadcast tool call event
   */
  broadcastToolCall(projectId: string, sessionId: string, toolCall: {
    id: string;
    name: string;
    todoIndex: number; // Explicit todo index for proper nesting
    input?: unknown;
    state: 'input-available' | 'output-available';
  }) {
    const key = `${projectId}-${sessionId}`;
    
    if (!this.pendingUpdates.has(key)) {
      this.pendingUpdates.set(key, {
        projectId,
        sessionId,
        updates: [],
      });
    }

    const batch = this.pendingUpdates.get(key)!;
    batch.updates.push({
      type: 'tool-call',
      data: toolCall,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast todo update
   */
  broadcastTodoUpdate(projectId: string, sessionId: string, todos: unknown[]) {
    const key = `${projectId}-${sessionId}`;
    
    if (!this.pendingUpdates.has(key)) {
      this.pendingUpdates.set(key, {
        projectId,
        sessionId,
        updates: [],
      });
    }

    const batch = this.pendingUpdates.get(key)!;
    batch.updates.push({
      type: 'todo-update',
      data: { todos },
      timestamp: Date.now(),
    });

    // Todos are important - flush immediately
    this.flushBatch(key);
  }

  /**
   * Process and send batched updates
   */
  private processBatchedUpdates() {
    for (const [key, batch] of this.pendingUpdates.entries()) {
      this.flushBatch(key);
    }
  }

  /**
   * Flush a specific batch to clients
   */
  private flushBatch(key: string) {
    const batch = this.pendingUpdates.get(key);
    if (!batch || batch.updates.length === 0) return;

    const { projectId, sessionId, updates } = batch;

    // Find all clients subscribed to this project/session
    const subscribers = Array.from(this.clients.values()).filter(
      client => client.projectId === projectId && 
                (!client.sessionId || client.sessionId === sessionId)
    );

    if (subscribers.length === 0) {
      // No subscribers, clear batch
      this.pendingUpdates.delete(key);
      return;
    }

    // Send batched update
    const message = {
      type: 'batch-update',
      projectId,
      sessionId,
      updates,
      timestamp: Date.now(),
    };

    subscribers.forEach(client => {
      this.sendMessage(client.ws, message);
    });

    // Clear batch
    this.pendingUpdates.delete(key);
  }

  /**
   * Send heartbeat to all connected clients
   */
  private sendHeartbeats() {
    const now = Date.now();
    
    for (const [clientId, client] of this.clients.entries()) {
      // Check if client timed out
      if (now - client.lastHeartbeat > this.CLIENT_TIMEOUT) {
        console.log(`[WebSocket] Client timeout: ${clientId}`);
        client.ws.close();
        this.clients.delete(clientId);
        continue;
      }

      // Send heartbeat
      this.sendMessage(client.ws, { type: 'heartbeat', timestamp: now });
    }
  }

  /**
   * Send current state to a client (on reconnect)
   */
  private async sendCurrentState(client: ClientSubscription) {
    // This will be implemented to fetch from database
    // For now, just acknowledge the request
    this.sendMessage(client.ws, {
      type: 'state-response',
      message: 'State fetch from database coming soon',
      timestamp: Date.now(),
    });
  }

  /**
   * Send message to a specific WebSocket
   */
  private sendMessage(ws: WebSocket, message: any) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('[WebSocket] Failed to send message:', error);
      }
    }
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get connection stats
   */
  getStats() {
    return {
      totalClients: this.clients.size,
      pendingBatches: this.pendingUpdates.size,
      clientsByProject: this.getClientsByProject(),
    };
  }

  /**
   * Get clients grouped by project
   */
  private getClientsByProject() {
    const byProject = new Map<string, number>();
    
    for (const client of this.clients.values()) {
      const count = byProject.get(client.projectId) || 0;
      byProject.set(client.projectId, count + 1);
    }

    return Object.fromEntries(byProject);
  }

  /**
   * Shutdown WebSocket server
   */
  shutdown() {
    console.log('[WebSocket] Shutting down server...');
    
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
    }
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all client connections
    for (const client of this.clients.values()) {
      client.ws.close();
    }
    
    this.clients.clear();
    this.pendingUpdates.clear();

    if (this.wss) {
      this.wss.close();
    }

    console.log('[WebSocket] Server shut down');
  }
}

// Singleton instance
export const buildWebSocketServer = new BuildWebSocketServer();

