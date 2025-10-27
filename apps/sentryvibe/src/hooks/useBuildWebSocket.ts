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

const DEBUG = false; // Set to true for verbose logging

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
   * Convert date fields from strings to Date objects
   */
  const normalizeDates = useCallback((obj: any): any => {
    if (!obj || typeof obj !== 'object') return obj;
    
    const normalized = { ...obj };
    
    // Convert common date fields
    const dateFields = ['startTime', 'endTime', 'timestamp', 'createdAt', 'updatedAt'];
    for (const field of dateFields) {
      if (normalized[field] && typeof normalized[field] === 'string') {
        normalized[field] = new Date(normalized[field]);
      }
    }
    
    // Recursively handle nested objects
    if (normalized.toolsByTodo) {
      for (const todoIndex in normalized.toolsByTodo) {
        normalized.toolsByTodo[todoIndex] = normalized.toolsByTodo[todoIndex].map((tool: any) => ({
          ...tool,
          startTime: tool.startTime ? new Date(tool.startTime) : tool.startTime,
          endTime: tool.endTime ? new Date(tool.endTime) : tool.endTime,
        }));
      }
    }
    
    if (normalized.textByTodo) {
      for (const todoIndex in normalized.textByTodo) {
        normalized.textByTodo[todoIndex] = normalized.textByTodo[todoIndex].map((text: any) => ({
          ...text,
          timestamp: text.timestamp ? new Date(text.timestamp) : text.timestamp,
        }));
      }
    }
    
    return normalized;
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
          
          // Normalize dates in the hydrated state
          const normalizedState = normalizeDates(latestSession.hydratedState);
          setState(normalizedState as GenerationState);
        }
      }
    } catch (err) {
      console.error('[useBuildWebSocket] Failed to hydrate state:', err);
      setError(err as Error);
    }
  }, [projectId, normalizeDates]);

  /**
   * Process batch update from WebSocket
   */
  const processBatchUpdate = useCallback((message: WebSocketMessage) => {
    const updates = message.updates;
    if (!updates || !Array.isArray(updates) || updates.length === 0) return;
    
    setState((prevState) => {
      // BUG FIX: If prevState is null (before hydration), queue the updates for later
      // instead of dropping them. We'll create a minimal state to hold the updates.
      if (!prevState) {
        if (DEBUG) console.log('[useBuildWebSocket] Received updates before hydration, creating temporary state');
        
        // Create minimal state to hold these updates
        // This will be merged with hydrated state when it arrives
        prevState = {
          id: `temp-${Date.now()}`,
          projectId: message.projectId || '',
          projectName: '',
          operationType: 'continuation',
          todos: [],
          toolsByTodo: {},
          textByTodo: {},
          activeTodoIndex: -1,
          isActive: true,
          startTime: new Date(),
        };
      }
      
      let newState = { ...prevState };
      
      for (const update of updates) {
        switch (update.type) {
          case 'state-update':
            // Merge state update and normalize dates
            const normalizedUpdate = normalizeDates(update.data);
            newState = {
              ...newState,
              ...normalizedUpdate as Partial<GenerationState>,
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
              todoIndex: number; // Explicit todo index from server
              state: 'input-available' | 'output-available';
              input?: unknown;
            };
            
            // BUG FIX: Use explicit todoIndex from server instead of guessing
            // If server didn't provide todoIndex, skip this tool (don't default to 0)
            if (typeof toolData.todoIndex !== 'number' || toolData.todoIndex < 0) {
              if (DEBUG) console.log(`[useBuildWebSocket] Tool ${toolData.id} has no valid todoIndex, skipping`);
              break;
            }
            
            const targetTodoIndex = toolData.todoIndex;
            
            if (toolData.state === 'input-available') {
              // Add new tool call to the EXPLICIT todo index from server
              const existingTools = newState.toolsByTodo[targetTodoIndex] || [];
              
              // Check if tool already exists (prevent duplicates)
              const exists = existingTools.some(t => t.id === toolData.id);
              if (exists) {
                if (DEBUG) console.log(`[useBuildWebSocket] Tool ${toolData.id} already exists in todo[${targetTodoIndex}], skipping duplicate`);
                break;
              }
              
              if (DEBUG) console.log(`[useBuildWebSocket] Adding tool ${toolData.name} to todo[${targetTodoIndex}]`);
              
              newState.toolsByTodo = {
                ...newState.toolsByTodo,
                [targetTodoIndex]: [
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
              // Update existing tool with output in the EXPLICIT todo index
              const tools = newState.toolsByTodo[targetTodoIndex] || [];
              const toolIndex = tools.findIndex(t => t.id === toolData.id);
              
              if (toolIndex >= 0) {
                if (DEBUG) console.log(`[useBuildWebSocket] Updating tool ${toolData.id} output in todo[${targetTodoIndex}]`);
                
                const updatedTools = [...tools];
                updatedTools[toolIndex] = {
                  ...updatedTools[toolIndex],
                  state: 'output-available',
                  endTime: new Date(),
                };
                
                newState.toolsByTodo = {
                  ...newState.toolsByTodo,
                  [targetTodoIndex]: updatedTools,
                };
              } else {
                if (DEBUG) console.log(`[useBuildWebSocket] Tool ${toolData.id} not found in todo[${targetTodoIndex}] for output update`);
              }
            }
            break;
        }
      }
      
      return newState;
    });
    
    if (DEBUG) console.log(`[useBuildWebSocket] Processed ${updates.length} updates`);
  }, [normalizeDates]);

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

