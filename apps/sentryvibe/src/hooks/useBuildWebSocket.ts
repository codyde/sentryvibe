/**
 * React Hook for Build WebSocket Connection
 * 
 * Provides real-time build state updates via WebSocket with:
 * - Automatic reconnection with exponential backoff
 * - State hydration from database on mount
 * - Batched update processing
 * - Connection status tracking
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { GenerationState } from '@/types/generation';

interface WebSocketMessage {
  type: string;
  projectId?: string;
  sessionId?: string;
  state?: Partial<GenerationState>;
  updates?: Array<{
    type: string;
    data: unknown;
    timestamp: number;
  }>;
  timestamp?: number;
  clientId?: string;
}

interface UseBuildWebSocketOptions {
  projectId: string;
  sessionId?: string;
  enabled?: boolean;
}

interface UseBuildWebSocketReturn {
  state: GenerationState | null;
  isConnected: boolean;
  isReconnecting: boolean;
  error: Error | null;
  reconnect: () => void;
}

const DEBUG = true; // Set to true for verbose logging

export function useBuildWebSocket({
  projectId,
  sessionId,
  enabled = true,
}: UseBuildWebSocketOptions): UseBuildWebSocketReturn {
  const [state, setState] = useState<GenerationState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  
  const MAX_RECONNECT_ATTEMPTS = 10;
  const BASE_RECONNECT_DELAY = 1000; // 1 second
  const MAX_RECONNECT_DELAY = 30000; // 30 seconds
  
  /**
   * Calculate reconnect delay with exponential backoff
   */
  const getReconnectDelay = useCallback(() => {
    const exponentialDelay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current),
      MAX_RECONNECT_DELAY
    );
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 1000;
    return exponentialDelay + jitter;
  }, []);

  /**
   * Hydrate state from database on mount
   */
  const hydrateState = useCallback(async () => {
    if (!projectId) return;
    
    try {
      if (DEBUG) console.log('[useBuildWebSocket] Hydrating state from database...');
      const response = await fetch(`/api/projects/${projectId}/messages`);
      
      if (!response.ok) {
        throw new Error(`Failed to hydrate state: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Extract latest generation state from sessions
      if (data.sessions && data.sessions.length > 0) {
        const latestSession = data.sessions[0];
        if (latestSession.hydratedState) {
          if (DEBUG) console.log('[useBuildWebSocket] State hydrated successfully');
          setState(latestSession.hydratedState as GenerationState);
        }
      }
    } catch (err) {
      console.error('[useBuildWebSocket] Failed to hydrate state:', err);
      setError(err as Error);
    }
  }, [projectId]);

  /**
   * Process batch update from WebSocket
   */
  const processBatchUpdate = useCallback((message: WebSocketMessage) => {
    const updates = message.updates;
    if (!updates || !Array.isArray(updates) || updates.length === 0) return;
    
    setState((prevState) => {
      if (!prevState) return prevState;
      
      let newState = { ...prevState };
      
      for (const update of updates) {
        switch (update.type) {
          case 'state-update':
            // Merge state update
            newState = {
              ...newState,
              ...update.data as Partial<GenerationState>,
            };
            break;
          
          case 'todo-update':
            // Update todos
            const todoData = update.data as { todos?: unknown[] };
            if (todoData.todos) {
              newState.todos = todoData.todos as GenerationState['todos'];
            }
            break;
          
          case 'tool-call':
            // Add or update tool call
            const toolData = update.data as {
              id: string;
              name: string;
              state: 'input-available' | 'output-available';
              input?: unknown;
            };
            
            // Find active todo index
            const activeTodoIndex = newState.activeTodoIndex >= 0 
              ? newState.activeTodoIndex 
              : 0;
            
            if (toolData.state === 'input-available') {
              // Add new tool call
              const existingTools = newState.toolsByTodo[activeTodoIndex] || [];
              newState.toolsByTodo = {
                ...newState.toolsByTodo,
                [activeTodoIndex]: [
                  ...existingTools,
                  {
                    id: toolData.id,
                    name: toolData.name,
                    input: toolData.input,
                    state: 'input-available',
                    startTime: new Date(),
                  },
                ],
              };
            } else {
              // Update existing tool with output
              const tools = newState.toolsByTodo[activeTodoIndex] || [];
              const toolIndex = tools.findIndex(t => t.id === toolData.id);
              
              if (toolIndex >= 0) {
                const updatedTools = [...tools];
                updatedTools[toolIndex] = {
                  ...updatedTools[toolIndex],
                  state: 'output-available',
                  endTime: new Date(),
                };
                
                newState.toolsByTodo = {
                  ...newState.toolsByTodo,
                  [activeTodoIndex]: updatedTools,
                };
              }
            }
            break;
        }
      }
      
      return newState;
    });
    
    if (DEBUG) console.log(`[useBuildWebSocket] Processed ${updates.length} updates`);
  }, []);

  /**
   * Handle WebSocket message
   */
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      if (DEBUG) console.log('[useBuildWebSocket] Message received:', message.type);
      
      switch (message.type) {
        case 'connected':
          setIsConnected(true);
          setIsReconnecting(false);
          reconnectAttemptsRef.current = 0;
          if (DEBUG) console.log('[useBuildWebSocket] Connected:', message.clientId);
          break;
        
        case 'batch-update':
          processBatchUpdate(message);
          break;
        
        case 'state-update':
          // Single state update (less common, used for full state sync)
          if (message.state) {
            setState((prevState) => ({
              ...prevState!,
              ...message.state,
            }));
          }
          break;
        
        case 'heartbeat':
          // Send heartbeat ack
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ 
              type: 'heartbeat', 
              timestamp: Date.now() 
            }));
          }
          break;
        
        case 'heartbeat-ack':
          // Heartbeat acknowledged
          break;
        
        default:
          if (DEBUG) console.log('[useBuildWebSocket] Unknown message type:', message.type);
      }
    } catch (err) {
      console.error('[useBuildWebSocket] Failed to process message:', err);
    }
  }, [processBatchUpdate]);

  /**
   * Connect to WebSocket server
   */
  const connect = useCallback(() => {
    if (!enabled || !projectId) {
      if (DEBUG) console.log('[useBuildWebSocket] Connection disabled or no projectId');
      return;
    }
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (DEBUG) console.log('[useBuildWebSocket] Already connected');
      return;
    }
    
    try {
      // Determine WebSocket URL (ws:// for http://, wss:// for https://)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      let url = `${protocol}//${host}/ws?projectId=${projectId}`;
      
      if (sessionId) {
        url += `&sessionId=${sessionId}`;
      }
      
      if (DEBUG) console.log('[useBuildWebSocket] Connecting to:', url);
      
      const ws = new WebSocket(url);
      wsRef.current = ws;
      
      ws.onopen = () => {
        if (DEBUG) console.log('[useBuildWebSocket] WebSocket opened');
        setIsConnected(true);
        setIsReconnecting(false);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };
      
      ws.onmessage = handleMessage;
      
      ws.onclose = () => {
        if (!isMountedRef.current) return;
        
        if (DEBUG) console.log('[useBuildWebSocket] WebSocket closed');
        setIsConnected(false);
        
        // Attempt to reconnect if still enabled
        if (enabled && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          setIsReconnecting(true);
          const delay = getReconnectDelay();
          
          if (DEBUG) console.log(`[useBuildWebSocket] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttemptsRef.current + 1}/${MAX_RECONNECT_ATTEMPTS})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        } else {
          setIsReconnecting(false);
          if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
            setError(new Error('Max reconnection attempts reached'));
          }
        }
      };
      
      ws.onerror = (event) => {
        console.error('[useBuildWebSocket] WebSocket error:', event);
        setError(new Error('WebSocket connection error'));
      };
      
    } catch (err) {
      console.error('[useBuildWebSocket] Failed to create WebSocket:', err);
      setError(err as Error);
    }
  }, [enabled, projectId, sessionId, handleMessage, getReconnectDelay]);

  /**
   * Manual reconnect function
   */
  const reconnect = useCallback(() => {
    if (DEBUG) console.log('[useBuildWebSocket] Manual reconnect triggered');
    
    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Reset reconnect attempts
    reconnectAttemptsRef.current = 0;
    setError(null);
    
    // Connect
    connect();
  }, [connect]);

  /**
   * Initialize connection on mount
   */
  useEffect(() => {
    isMountedRef.current = true;
    
    // Hydrate state from database first
    hydrateState();
    
    // Then connect to WebSocket for real-time updates
    connect();
    
    return () => {
      isMountedRef.current = false;
      
      // Cleanup WebSocket
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      
      // Clear reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // Clear heartbeat interval
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [projectId, sessionId, enabled, connect, hydrateState]);

  return {
    state,
    isConnected,
    isReconnecting,
    error,
    reconnect,
  };
}

