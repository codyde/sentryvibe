/**
 * WebSocket Server for Real-Time Build Updates and Runner Communication
 * 
 * Provides real-time state synchronization without SSE's connection fragility.
 * 
 * Frontend Clients (/ws):
 * - Subscribe to project/session updates
 * - Receive batched state changes
 * - Auto-reconnect on disconnect
 * - Resume from last known state
 * 
 * Runner Connections (/ws/runner):
 * - Persistent WebSocket connections from runner processes
 * - Receive commands (start-build, start-dev-server, etc.)
 * - Send events (build-stream, log-chunk, etc.)
 * - Heartbeat/ping-pong keepalive
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { GenerationState } from '../../types/generation';
import type { RunnerCommand, RunnerEvent, RunnerMessage } from '../../shared/runner/messages';
import { isRunnerEvent } from '../../shared/runner/messages';
import { publishRunnerEvent } from '../runner/event-stream';
// NOTE: processGlobalRunnerEvent removed - DB writes now happen via HTTP from runner
import * as Sentry from '@sentry/node';
import { buildLogger } from '../logging/build-logger';

interface ClientSubscription {
  ws: WebSocket;
  projectId: string;
  sessionId?: string;
  lastHeartbeat: number;
}

interface RunnerConnection {
  id: string;
  socket: WebSocket;
  lastHeartbeat: number;
  pingInterval: NodeJS.Timeout;
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
    _sentry?: { trace?: string; baggage?: string }; // Optional trace context for distributed tracing
  }>;
}

// Get shared secret from environment - read dynamically to support late binding
const getSharedSecret = () => process.env.RUNNER_SHARED_SECRET;

class BuildWebSocketServer {
  private wss: WebSocketServer | null = null;
  private runnerWss: WebSocketServer | null = null;
  private clients: Map<string, ClientSubscription> = new Map();
  private runnerConnections: Map<string, RunnerConnection> = new Map();
  private pendingUpdates: Map<string, BatchedUpdate> = new Map();
  private batchInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private runnerCleanupInterval: NodeJS.Timeout | null = null;
  
  private readonly BATCH_DELAY = 200; // ms - batch updates for efficiency
  private readonly HEARTBEAT_INTERVAL = 30000; // 30s
  private readonly CLIENT_TIMEOUT = 60000; // 60s
  private readonly RUNNER_PING_INTERVAL = 30000; // 30s
  private readonly RUNNER_HEARTBEAT_TIMEOUT = 90000; // 90s

  // Metrics tracking for runner connections
  private runnerTotalEvents = 0;
  private runnerTotalCommands = 0;
  private runnerTotalErrors = 0;

  // Instance ID for debugging singleton issues
  private readonly instanceId = Math.random().toString(36).substring(7);
  private initialized = false;

  constructor() {
    buildLogger.websocket.serverCreated(this.instanceId);
  }

  /**
   * Initialize WebSocket server for both frontend clients and runners
   */
  initialize(server: Server, path: string = '/ws') {
    // Prevent multiple initializations (e.g., during HMR in dev mode)
    if (this.initialized) {
      buildLogger.log('debug', 'websocket', `Server already initialized (instance: ${this.instanceId}), skipping...`, { instanceId: this.instanceId });
      return;
    }
    
    buildLogger.log('debug', 'websocket', `Initializing server (instance: ${this.instanceId})...`, { instanceId: this.instanceId });
    this.initialized = true;
    
    // Frontend client WebSocket server - noServer mode for manual upgrade handling
    this.wss = new WebSocketServer({ 
      noServer: true,
      perMessageDeflate: false, // Disable compression for lower latency
    });

    this.wss.on('connection', (ws: WebSocket, req) => {
      this.handleConnection(ws, req);
    });

    // Runner WebSocket server on /ws/runner - noServer mode for manual upgrade handling
    this.runnerWss = new WebSocketServer({
      noServer: true,
      perMessageDeflate: false,
    });

    this.runnerWss.on('connection', (ws: WebSocket, req) => {
      this.handleRunnerConnection(ws, req);
    });

    // Manually handle HTTP upgrade events to route to correct WebSocket server
    server.on('upgrade', (request, socket, head) => {
      const pathname = request.url?.split('?')[0] || '';
      
      if (pathname === '/ws/runner') {
        // Runner connection - handle with runnerWss
        this.runnerWss!.handleUpgrade(request, socket, head, (ws) => {
          this.runnerWss!.emit('connection', ws, request);
        });
      } else if (pathname === path || pathname === '/ws') {
        // Frontend client connection - handle with wss
        this.wss!.handleUpgrade(request, socket, head, (ws) => {
          this.wss!.emit('connection', ws, request);
        });
      } else {
        // Unknown path - destroy the socket
        // Only log non-root paths as warnings (root path is often probed by browsers/tools)
        if (pathname && pathname !== '/') {
          buildLogger.websocket.unknownUpgradePath(pathname);
        }
        socket.destroy();
      }
    });

    // Start batch processing interval
    this.batchInterval = setInterval(() => {
      this.processBatchedUpdates();
    }, this.BATCH_DELAY);

    // Start heartbeat interval for frontend clients
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeats();
    }, this.HEARTBEAT_INTERVAL);

    // Start stale runner connection cleanup interval
    this.runnerCleanupInterval = setInterval(() => {
      this.cleanupStaleRunnerConnections();
    }, 60000); // Check every 60s

    buildLogger.websocket.serverInitialized(path, '/ws/runner');
  }

  // ============================================================
  // FRONTEND CLIENT HANDLING
  // ============================================================

  /**
   * Handle new frontend WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: any) {
    const clientId = this.generateClientId();
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const projectId = url.searchParams.get('projectId') || '';
    const sessionId = url.searchParams.get('sessionId') || undefined;

    buildLogger.websocket.clientConnected(clientId, projectId, sessionId);

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
        buildLogger.websocket.error('Failed to parse client message', error, { clientId });
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      buildLogger.websocket.clientDisconnected(clientId);
      this.clients.delete(clientId);
    });

    // Handle errors
    ws.on('error', (error) => {
      buildLogger.websocket.error('Client error', error, { clientId });
      this.clients.delete(clientId);
    });
  }

  // ============================================================
  // RUNNER CONNECTION HANDLING
  // ============================================================

  /**
   * Handle new runner WebSocket connection
   */
  private handleRunnerConnection(ws: WebSocket, req: any) {
    // Authenticate runner via Bearer token
    // Read secret dynamically - it may be set after module load
    const sharedSecret = getSharedSecret();
    const authHeader = req.headers['authorization'];
    if (!sharedSecret) {
      buildLogger.websocket.runnerAuthMissing();
      ws.close(1008, 'Server misconfigured');
      return;
    }

    if (!authHeader || authHeader !== `Bearer ${sharedSecret}`) {
      buildLogger.websocket.runnerAuthRejected();
      ws.close(1008, 'Unauthorized');
      return;
    }

    // Extract runner ID from query params
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const runnerId = url.searchParams.get('runnerId') ?? 'default';

    buildLogger.websocket.runnerConnected(runnerId);

    // Setup ping/pong keepalive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, this.RUNNER_PING_INTERVAL);

    // Store runner connection
    this.runnerConnections.set(runnerId, {
      id: runnerId,
      socket: ws,
      lastHeartbeat: Date.now(),
      pingInterval,
    });

    // Sentry breadcrumb for connection
    Sentry.addBreadcrumb({
      category: 'websocket',
      message: `Runner connected: ${runnerId}`,
      level: 'info',
    });

    // Handle pong (heartbeat response)
    ws.on('pong', () => {
      const conn = this.runnerConnections.get(runnerId);
      if (conn) {
        conn.lastHeartbeat = Date.now();
      }
    });

    // Handle messages from runner
    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as RunnerMessage;
        if (isRunnerEvent(message)) {
          const event = message as RunnerEvent;

          // Update heartbeat on runner-status events
          if (event.type === 'runner-status') {
            const conn = this.runnerConnections.get(runnerId);
            if (conn) conn.lastHeartbeat = Date.now();
          }

          this.runnerTotalEvents++;
          await this.processRunnerEvent(event);
        }
      } catch (error) {
        this.runnerTotalErrors++;
        Sentry.captureException(error, {
          tags: { runnerId, source: 'websocket_message' },
          level: 'error',
        });
        buildLogger.websocket.error('Failed to handle runner message', error, { runnerId });
      }
    });

    // Handle runner disconnect
    ws.on('close', (code) => {
      buildLogger.websocket.runnerDisconnected(runnerId, code);
      const conn = this.runnerConnections.get(runnerId);
      if (conn) {
        clearInterval(conn.pingInterval);
      }
      this.runnerConnections.delete(runnerId);

      Sentry.addBreadcrumb({
        category: 'websocket',
        message: `Runner disconnected: ${runnerId}`,
        level: 'info',
        data: { code },
      });
    });

    // Handle runner errors
    ws.on('error', (error) => {
      buildLogger.websocket.error('Runner socket error', error, { runnerId });
      this.runnerTotalErrors++;

      Sentry.captureException(error, {
        tags: { runnerId, source: 'websocket_error' },
        level: 'error',
      });

      const conn = this.runnerConnections.get(runnerId);
      if (conn) {
        clearInterval(conn.pingInterval);
      }
      this.runnerConnections.delete(runnerId);
    });
  }

  /**
   * Process runner event - publish to event stream for WebSocket broadcasts
   * NOTE: Database writes now happen via HTTP from the runner (/api/runner-events, /api/build-events)
   */
  private async processRunnerEvent(event: RunnerEvent) {
    // Publish event to internal event stream
    // This triggers persistent-event-processor for WebSocket broadcasts
    // DB writes are handled by HTTP endpoints called directly from runner
    publishRunnerEvent(event);
  }

  /**
   * Send a command to a specific runner
   */
  sendCommandToRunner(runnerId: string, command: RunnerCommand): boolean {
    const connection = this.runnerConnections.get(runnerId);

    if (!connection || connection.socket.readyState !== WebSocket.OPEN) {
      buildLogger.websocket.runnerNotConnected(runnerId, command.type);
      return false;
    }

    try {
      // Attach Sentry trace context only if there's an active span
      // This ensures we don't propagate stale/ambient trace context
      const activeSpan = Sentry.getActiveSpan();
      const hasTrace = !!activeSpan;
      if (activeSpan) {
        const traceData = Sentry.getTraceData();
        if (traceData['sentry-trace']) {
          command._sentry = {
            trace: traceData['sentry-trace'],
            baggage: traceData.baggage,
          };
          buildLogger.log('debug', 'websocket', `Attaching trace to command ${command.type}`, {
            tracePreview: traceData['sentry-trace'].substring(0, 50)
          });
        }
      }
      
      buildLogger.websocket.commandSent(runnerId, command.type, hasTrace);

      connection.socket.send(JSON.stringify(command));
      this.runnerTotalCommands++;
      return true;
    } catch (error) {
      this.runnerTotalErrors++;
      Sentry.captureException(error, {
        tags: { runnerId, commandType: command.type },
        level: 'error',
      });
      buildLogger.websocket.error('Failed to send command to runner', error, { runnerId, commandType: command.type });
      return false;
    }
  }

  /**
   * List all connected runners with their status
   */
  listRunnerConnections(): Array<{ runnerId: string; lastHeartbeat: number; lastHeartbeatAge: number }> {
    const now = Date.now();
    return Array.from(this.runnerConnections.values()).map(({ id, lastHeartbeat }) => ({
      runnerId: id,
      lastHeartbeat,
      lastHeartbeatAge: now - lastHeartbeat,
    }));
  }

  /**
   * Check if a specific runner is connected
   */
  isRunnerConnected(runnerId: string): boolean {
    const conn = this.runnerConnections.get(runnerId);
    return conn !== undefined && conn.socket.readyState === WebSocket.OPEN;
  }

  /**
   * Get runner metrics
   */
  getRunnerMetrics() {
    return {
      totalEvents: this.runnerTotalEvents,
      totalCommands: this.runnerTotalCommands,
      totalErrors: this.runnerTotalErrors,
      activeConnections: this.runnerConnections.size,
    };
  }

  /**
   * Cleanup stale runner connections
   */
  private cleanupStaleRunnerConnections() {
    const now = Date.now();
    for (const [runnerId, conn] of this.runnerConnections.entries()) {
      if (now - conn.lastHeartbeat > this.RUNNER_HEARTBEAT_TIMEOUT) {
        buildLogger.websocket.runnerStaleRemoved(runnerId);

        Sentry.addBreadcrumb({
          category: 'websocket',
          message: `Stale runner connection removed: ${runnerId}`,
          level: 'warning',
          data: { age: now - conn.lastHeartbeat },
        });

        clearInterval(conn.pingInterval);
        conn.socket.close(1000, 'Heartbeat timeout');
        this.runnerConnections.delete(runnerId);
      }
    }
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
        buildLogger.websocket.clientSubscribed(clientId, message.projectId);
        break;
      
      case 'get-state':
        // Client requesting current state (on reconnect)
        this.sendCurrentState(client);
        break;
    }
  }

  /**
   * @deprecated Use discrete event broadcasts instead (broadcastBuildStarted, broadcastTodosUpdate,
   * broadcastToolCall, broadcastBuildComplete). This method broadcasts full state snapshots which
   * is inefficient for real-time updates. Kept for state recovery scenarios.
   */
  broadcastStateUpdate(
    projectId: string,
    sessionId: string,
    state: Partial<GenerationState>
  ) {
    const key = `${projectId}-${sessionId}`;
    
    // Add to pending updates for batching
    if (!this.pendingUpdates.has(key)) {
      this.pendingUpdates.set(key, {
        projectId,
        sessionId,
        updates: [],
      });
    }

    // OPTIONAL: Capture current trace context if available
    const activeSpan = Sentry.getActiveSpan();
    const traceContext = activeSpan ? {
      trace: Sentry.getTraceData()['sentry-trace'],
      baggage: Sentry.getTraceData().baggage,
    } : undefined;

    const batch = this.pendingUpdates.get(key)!;
    batch.updates.push({
      type: 'state-update',
      data: state,
      timestamp: Date.now(),
      _sentry: traceContext, // Optional - won't break if missing
    });

    // If batch is getting large, flush immediately
    if (batch.updates.length >= 10) {
      this.flushBatch(key);
    }
  }

  /**
   * Broadcast tool call event
   */
  broadcastToolCall(
    projectId: string,
    sessionId: string,
    toolCall: {
      id: string;
      name: string;
      todoIndex: number; // Can be -1 for planning phase tools (before first TodoWrite)
      input?: unknown;
      output?: unknown; // Tool output for completion events
      state: 'input-available' | 'output-available' | 'error'; // input-available for planning shimmer
    }
  ) {
    const key = `${projectId}-${sessionId}`;

    // Debug: Log planning tool broadcasts
    if (toolCall.todoIndex < 0) {
      const subscriberCount = Array.from(this.clients.values()).filter(
        client => client.projectId === projectId
      ).length;
      buildLogger.websocket.broadcastToolCall(toolCall.name, toolCall.state, subscriberCount);
    }

    if (!this.pendingUpdates.has(key)) {
      this.pendingUpdates.set(key, {
        projectId,
        sessionId,
        updates: [],
      });
    }

    // OPTIONAL: Capture current trace context if available
    const activeSpan = Sentry.getActiveSpan();
    const traceContext = activeSpan ? {
      trace: Sentry.getTraceData()['sentry-trace'],
      baggage: Sentry.getTraceData().baggage,
    } : undefined;

    const batch = this.pendingUpdates.get(key)!;
    batch.updates.push({
      type: 'tool-call',
      data: toolCall,
      timestamp: Date.now(),
      _sentry: traceContext, // Optional - won't break if missing
    });

    // Tool updates are critical for UI - flush immediately
    this.flushBatch(key);
  }

  /**
   * Broadcast build started event
   * This signals a new build has begun - flush immediately
   */
  broadcastBuildStarted(
    projectId: string,
    sessionId: string,
    buildId: string
  ) {
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
      type: 'build-started',
      data: { buildId, sessionId, projectId },
      timestamp: Date.now(),
    });

    // Build start is important - flush immediately
    this.flushBatch(key);
  }

  /**
   * Broadcast todos update (when TodoWrite tool is called)
   * This establishes or updates the todo list - flush immediately
   * @param phase - Optional phase ('template' | 'build') to distinguish template setup from build tasks
   */
  broadcastTodosUpdate(
    projectId: string,
    sessionId: string,
    todos: Array<{ content: string; status: string; activeForm?: string }>,
    activeTodoIndex: number,
    phase?: 'template' | 'build'
  ) {
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
      type: 'todos-update',
      data: { todos, activeTodoIndex, phase },
      timestamp: Date.now(),
    });

    // Todos are critical for UI - flush immediately
    this.flushBatch(key);
  }

  /**
   * Broadcast that a specific todo has completed (batch write finished)
   * This signals that all events for this todo have been persisted to DB
   */
  broadcastTodoCompleted(
    projectId: string,
    sessionId: string,
    todoIndex: number
  ) {
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
      type: 'todo-completed',
      data: { todoIndex, persisted: true },
      timestamp: Date.now(),
    });

    // Todo completion is important for reconnection state - flush immediately
    this.flushBatch(key);
  }

  /**
   * Broadcast build completed/failed event
   * This is a terminal state event - flush immediately
   */
  broadcastBuildComplete(
    projectId: string,
    sessionId: string,
    status: 'completed' | 'failed',
    summary?: string
  ) {
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
      type: 'build-complete',
      data: { status, summary },
      timestamp: Date.now(),
    });

    const allClients = Array.from(this.clients.values());
    const subscriberCount = allClients.filter(
      client => client.projectId === projectId
    ).length;
    
    // Debug: Log all connected clients and their projectIds
    console.log(`[WebSocket] 📡 Broadcasting build-complete for project ${projectId}`);
    console.log(`[WebSocket]    Total clients connected: ${allClients.length}`);
    console.log(`[WebSocket]    Subscribers for this project: ${subscriberCount}`);
    if (allClients.length > 0 && subscriberCount === 0) {
      console.log(`[WebSocket]    ⚠️ WARNING: No subscribers! Client projectIds: ${allClients.map(c => c.projectId).join(', ')}`);
    }
    
    buildLogger.websocket.broadcastBuildComplete(projectId, sessionId, subscriberCount);

    // Terminal event - flush immediately
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
      console.log(`[WebSocket] ⚠️ flushBatch: No subscribers for ${projectId}, dropping ${updates.length} updates`);
      console.log(`[WebSocket]    Update types: ${updates.map(u => u.type).join(', ')}`);
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
        buildLogger.websocket.clientTimeout(clientId);
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
        buildLogger.websocket.error('Failed to send message', error);
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
      totalRunners: this.runnerConnections.size,
      pendingBatches: this.pendingUpdates.size,
      clientsByProject: this.getClientsByProject(),
      runners: this.listRunnerConnections(),
      runnerMetrics: this.getRunnerMetrics(),
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
    buildLogger.websocket.shutdown();
    
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
    }
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.runnerCleanupInterval) {
      clearInterval(this.runnerCleanupInterval);
    }

    // Close all frontend client connections
    for (const client of this.clients.values()) {
      client.ws.close();
    }
    this.clients.clear();
    this.pendingUpdates.clear();

    // Close all runner connections gracefully
    for (const conn of this.runnerConnections.values()) {
      clearInterval(conn.pingInterval);
      conn.socket.close(1000, 'Server shutting down');
    }
    this.runnerConnections.clear();

    if (this.wss) {
      this.wss.close();
    }

    if (this.runnerWss) {
      this.runnerWss.close();
    }

    buildLogger.websocket.shutdownComplete();
  }
}

// Use globalThis to ensure singleton survives Next.js bundling
// Without this, API routes get a different instance than server.ts
declare global {
  // eslint-disable-next-line no-var
  var __buildWebSocketServer: BuildWebSocketServer | undefined;
}

// Create singleton on globalThis to share across all bundles
if (!globalThis.__buildWebSocketServer) {
  globalThis.__buildWebSocketServer = new BuildWebSocketServer();
}

export const buildWebSocketServer = globalThis.__buildWebSocketServer;

