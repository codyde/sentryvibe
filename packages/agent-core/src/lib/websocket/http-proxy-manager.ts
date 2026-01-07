/**
 * HTTP Proxy Manager for WebSocket-based HTTP tunneling
 * 
 * Enables proxying HTTP requests through the existing WebSocket connection
 * between the SaaS server and remote runners. This eliminates the need for
 * Cloudflare tunnels when the frontend is hosted remotely.
 * 
 * Flow: Browser → SaaS Server → WebSocket → Runner → localhost Dev Server
 */

import { randomUUID } from 'node:crypto';
import type { 
  HttpProxyRequestCommand, 
  HttpProxyResponseEvent, 
  HttpProxyChunkEvent, 
  HttpProxyErrorEvent,
  RunnerEvent 
} from '../../shared/runner/messages';
import { buildWebSocketServer } from './server';

// Chunk size for streaming large responses (64KB)
const CHUNK_SIZE = 64 * 1024;

// Request timeout (30 seconds)
const REQUEST_TIMEOUT_MS = 30000;

// Maximum response size to send in a single message (1MB)
// Larger responses will be chunked
const MAX_SINGLE_RESPONSE_SIZE = 1024 * 1024;

interface PendingRequest {
  resolve: (response: ProxyResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  chunks: Buffer[];
  headers?: Record<string, string>;
  statusCode?: number;
  runnerId: string;
}

export interface ProxyRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: Buffer | null;
}

export interface ProxyResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: Buffer;
}

class HttpProxyManager {
  private pendingRequests = new Map<string, PendingRequest>();
  
  /**
   * Proxy an HTTP request through the WebSocket connection to a runner
   */
  async proxyRequest(
    runnerId: string, 
    projectId: string,
    port: number,
    request: ProxyRequest
  ): Promise<ProxyResponse> {
    const requestId = randomUUID();
    
    console.log(`[http-proxy] Starting proxy request ${requestId}: ${request.method} ${request.path} → runner ${runnerId}:${port}`);
    
    // Check if runner is connected
    if (!buildWebSocketServer.isRunnerConnected(runnerId)) {
      console.error(`[http-proxy] Runner ${runnerId} is not connected`);
      throw new Error(`Runner ${runnerId} is not connected`);
    }
    
    return new Promise<ProxyResponse>((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`HTTP proxy request timeout after ${REQUEST_TIMEOUT_MS}ms`));
        }
      }, REQUEST_TIMEOUT_MS);
      
      // Store pending request
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout,
        chunks: [],
        runnerId,
      });
      
      // Build the command
      const command: HttpProxyRequestCommand = {
        id: randomUUID(),
        type: 'http-proxy-request',
        projectId,
        timestamp: new Date().toISOString(),
        payload: {
          requestId,
          method: request.method,
          path: request.path,
          headers: request.headers,
          body: request.body ? request.body.toString('base64') : null,
          port,
        },
      };
      
      // Send command to runner
      console.log(`[http-proxy] Sending command to runner ${runnerId}, requestId: ${requestId}`);
      const sent = buildWebSocketServer.sendCommandToRunner(runnerId, command);
      if (!sent) {
        console.error(`[http-proxy] Failed to send command to runner ${runnerId}`);
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(new Error(`Failed to send HTTP proxy request to runner ${runnerId}`));
      } else {
        console.log(`[http-proxy] Command sent successfully, waiting for response...`);
      }
    });
  }
  
  /**
   * Handle HTTP proxy response event from runner
   */
  handleProxyResponse(event: HttpProxyResponseEvent): void {
    console.log(`[http-proxy] Received response event for requestId: ${event.requestId}, status: ${event.statusCode}, isChunked: ${event.isChunked}`);
    
    const pending = this.pendingRequests.get(event.requestId);
    if (!pending) {
      console.warn(`[http-proxy] Received response for unknown request: ${event.requestId}`);
      console.warn(`[http-proxy] Pending requests: ${Array.from(this.pendingRequests.keys()).join(', ')}`);
      return;
    }
    
    // Store headers and status code
    pending.headers = event.headers;
    pending.statusCode = event.statusCode;
    
    // If response includes body and is not chunked, resolve immediately
    if (!event.isChunked && event.body !== undefined) {
      console.log(`[http-proxy] Resolving request ${event.requestId} with ${event.body.length} bytes (base64)`);
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(event.requestId);
      
      pending.resolve({
        statusCode: event.statusCode,
        headers: event.headers,
        body: Buffer.from(event.body, 'base64'),
      });
    }
    // If chunked, wait for chunks to arrive
  }
  
  /**
   * Handle HTTP proxy chunk event from runner
   */
  handleProxyChunk(event: HttpProxyChunkEvent): void {
    const pending = this.pendingRequests.get(event.requestId);
    if (!pending) {
      console.warn(`[http-proxy] Received chunk for unknown request: ${event.requestId}`);
      return;
    }
    
    // Add chunk to buffer
    pending.chunks.push(Buffer.from(event.chunk, 'base64'));
    
    // If final chunk, resolve the request
    if (event.isFinal) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(event.requestId);
      
      const body = Buffer.concat(pending.chunks);
      
      pending.resolve({
        statusCode: pending.statusCode || 200,
        headers: pending.headers || {},
        body,
      });
    }
  }
  
  /**
   * Handle HTTP proxy error event from runner
   */
  handleProxyError(event: HttpProxyErrorEvent): void {
    const pending = this.pendingRequests.get(event.requestId);
    if (!pending) {
      console.warn(`[http-proxy] Received error for unknown request: ${event.requestId}`);
      return;
    }
    
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(event.requestId);
    
    const error = new Error(event.error);
    (error as any).statusCode = event.statusCode;
    pending.reject(error);
  }
  
  /**
   * Process a runner event and handle HTTP proxy events
   */
  processEvent(event: RunnerEvent): boolean {
    console.log(`[http-proxy] processEvent called with type: ${event.type}`);
    switch (event.type) {
      case 'http-proxy-response':
        console.log(`[http-proxy] Processing http-proxy-response event`);
        this.handleProxyResponse(event as HttpProxyResponseEvent);
        return true;
      case 'http-proxy-chunk':
        console.log(`[http-proxy] Processing http-proxy-chunk event`);
        this.handleProxyChunk(event as HttpProxyChunkEvent);
        return true;
      case 'http-proxy-error':
        console.log(`[http-proxy] Processing http-proxy-error event`);
        this.handleProxyError(event as HttpProxyErrorEvent);
        return true;
      default:
        return false;
    }
  }
  
  /**
   * Cancel all pending requests for a specific runner (e.g., on disconnect)
   */
  cancelRequestsForRunner(runnerId: string): void {
    for (const [requestId, pending] of this.pendingRequests.entries()) {
      if (pending.runnerId === runnerId) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Runner disconnected'));
        this.pendingRequests.delete(requestId);
      }
    }
  }
  
  /**
   * Get stats about pending requests
   */
  getStats() {
    return {
      pendingRequests: this.pendingRequests.size,
      requestsByRunner: Array.from(this.pendingRequests.values())
        .reduce((acc, req) => {
          acc[req.runnerId] = (acc[req.runnerId] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
    };
  }
}

// Singleton instance
export const httpProxyManager = new HttpProxyManager();
