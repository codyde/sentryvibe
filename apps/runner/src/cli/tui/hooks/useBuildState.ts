/**
 * useBuildState - Hook to track build state and todos
 * 
 * Manages:
 * - Active builds list
 * - Current build selection (for multi-build navigation)
 * - Todo list updates
 * - Build lifecycle events
 * 
 * Subscribes to RunnerLogger events to automatically update state.
 * 
 * IMPORTANT: Uses refs for event handlers to prevent race conditions
 * where events could be missed during re-subscriptions caused by
 * callback dependency changes.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { BuildInfo, TodoItem, LogEntry } from '../../../lib/logging/types.js';
import { getLogBuffer } from '../../../lib/logging/log-buffer.js';
import { getLogger } from '../../../lib/logging/index.js';

export interface BuildState {
  builds: BuildInfo[];
  currentBuildIndex: number;
  currentBuild: BuildInfo | null;
  isConnected: boolean;
  isVerbose: boolean;
}

export interface BuildStateActions {
  nextBuild: () => void;
  prevBuild: () => void;
  setVerbose: (verbose: boolean) => void;
  toggleVerbose: () => void;
  addBuild: (build: BuildInfo) => void;
  updateBuild: (buildId: string, updates: Partial<BuildInfo>) => void;
  updateTodos: (buildId: string, todos: TodoItem[]) => void;
  setConnected: (connected: boolean) => void;
}

export function useBuildState(): [BuildState, BuildStateActions] {
  const [builds, setBuilds] = useState<BuildInfo[]>([]);
  const [currentBuildIndex, setCurrentBuildIndex] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isVerbose, setIsVerbose] = useState(false);

  // Derive current build from index
  const currentBuild = builds.length > 0 ? builds[currentBuildIndex] ?? null : null;

  // Navigation between builds
  const nextBuild = useCallback(() => {
    setCurrentBuildIndex(prev => {
      if (builds.length === 0) return 0;
      return (prev + 1) % builds.length;
    });
  }, [builds.length]);

  const prevBuild = useCallback(() => {
    setCurrentBuildIndex(prev => {
      if (builds.length === 0) return 0;
      return prev === 0 ? builds.length - 1 : prev - 1;
    });
  }, [builds.length]);

  // Verbose toggle - updates both UI state and logger
  const toggleVerbose = useCallback(() => {
    setIsVerbose(prev => {
      const newValue = !prev;
      // Also update the logger's verbose flag
      try {
        const logger = getLogger();
        logger.setVerbose(newValue);
      } catch {
        // Logger not initialized yet
      }
      return newValue;
    });
  }, []);

  // Track when a new build is added to auto-select it
  const [pendingNewBuildId, setPendingNewBuildId] = useState<string | null>(null);

  // Add a new build
  const addBuild = useCallback((build: BuildInfo) => {
    setBuilds(prev => {
      // Check if build already exists
      const exists = prev.some(b => b.id === build.id);
      if (exists) {
        // Update existing build
        return prev.map(b => b.id === build.id ? { ...b, ...build } : b);
      }
      // Mark this as a new build to auto-select
      setPendingNewBuildId(build.id);
      // Add new build
      return [...prev, build];
    });
  }, []);

  // Auto-select newly added builds
  useEffect(() => {
    if (pendingNewBuildId) {
      const index = builds.findIndex(b => b.id === pendingNewBuildId);
      if (index !== -1) {
        setCurrentBuildIndex(index);
      }
      setPendingNewBuildId(null);
    }
  }, [builds, pendingNewBuildId]);

  // Update an existing build
  const updateBuild = useCallback((buildId: string, updates: Partial<BuildInfo>) => {
    setBuilds(prev => prev.map(build => 
      build.id === buildId ? { ...build, ...updates } : build
    ));
  }, []);

  // Update todos for a build
  const updateTodos = useCallback((buildId: string, todos: TodoItem[]) => {
    setBuilds(prev => prev.map(build =>
      build.id === buildId ? { ...build, todos } : build
    ));
  }, []);

  // Connection status
  const setConnected = useCallback((connected: boolean) => {
    setIsConnected(connected);
  }, []);

  // Use refs to store the latest callbacks so event handlers always call current versions
  // This prevents race conditions where events could be missed during re-subscriptions
  const addBuildRef = useRef(addBuild);
  const updateBuildRef = useRef(updateBuild);
  const updateTodosRef = useRef(updateTodos);
  
  // Keep refs up to date
  useEffect(() => {
    addBuildRef.current = addBuild;
  }, [addBuild]);
  
  useEffect(() => {
    updateBuildRef.current = updateBuild;
  }, [updateBuild]);
  
  useEffect(() => {
    updateTodosRef.current = updateTodos;
  }, [updateTodos]);

  // Subscribe to RunnerLogger events - only runs ONCE on mount
  // Uses refs for callbacks to avoid re-subscription race conditions
  useEffect(() => {
    let logger: ReturnType<typeof getLogger> | null = null;
    
    try {
      logger = getLogger();
      
      // Sync initial state from logger (in case events already fired)
      setIsConnected(logger.isConnected());
      setIsVerbose(logger.isVerbose());
      
      // Load any existing builds
      const existingBuilds = logger.getAllBuilds();
      if (existingBuilds.length > 0) {
        for (const build of existingBuilds) {
          addBuildRef.current(build);
        }
      }
    } catch {
      // Logger not initialized yet - this is fine during startup
      return;
    }
    
    // Handle build start events - use ref to get latest callback
    const handleBuildStart = (build: BuildInfo) => {
      addBuildRef.current(build);
    };
    
    // Handle build update events
    const handleBuildUpdate = (build: BuildInfo) => {
      updateBuildRef.current(build.id, build);
    };
    
    // Handle build complete events
    const handleBuildComplete = (build: BuildInfo) => {
      updateBuildRef.current(build.id, { ...build, status: build.status });
    };
    
    // Handle todo updates
    const handleTodoUpdate = (buildId: string, todos: TodoItem[]) => {
      updateTodosRef.current(buildId, todos);
    };
    
    // Handle connection events
    const handleConnected = () => {
      setIsConnected(true);
    };
    
    const handleDisconnected = () => {
      setIsConnected(false);
    };
    
    // Handle verbose change
    const handleVerboseChange = (verbose: boolean) => {
      setIsVerbose(verbose);
    };
    
    // Subscribe to events
    logger.on('buildStart', handleBuildStart);
    logger.on('buildUpdate', handleBuildUpdate);
    logger.on('buildComplete', handleBuildComplete);
    logger.on('todoUpdate', handleTodoUpdate);
    logger.on('connected', handleConnected);
    logger.on('disconnected', handleDisconnected);
    logger.on('verboseChange', handleVerboseChange);
    
    // Cleanup - only runs on unmount
    return () => {
      if (logger) {
        logger.off('buildStart', handleBuildStart);
        logger.off('buildUpdate', handleBuildUpdate);
        logger.off('buildComplete', handleBuildComplete);
        logger.off('todoUpdate', handleTodoUpdate);
        logger.off('connected', handleConnected);
        logger.off('disconnected', handleDisconnected);
        logger.off('verboseChange', handleVerboseChange);
      }
    };
  }, []); // Empty deps - only subscribe once on mount

  const state: BuildState = {
    builds,
    currentBuildIndex,
    currentBuild,
    isConnected,
    isVerbose,
  };

  const actions: BuildStateActions = {
    nextBuild,
    prevBuild,
    setVerbose: setIsVerbose,
    toggleVerbose,
    addBuild,
    updateBuild,
    updateTodos,
    setConnected,
  };

  return [state, actions];
}

/**
 * Hook to subscribe to log entries from the buffer
 */
export function useLogEntries(maxEntries: number = 100): LogEntry[] {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  useEffect(() => {
    const buffer = getLogBuffer();
    
    // Initialize with current entries
    setEntries(buffer.getRecent(maxEntries));

    // Subscribe to new entries
    const unsubscribe = buffer.onLog((entry) => {
      setEntries(prev => {
        const newEntries = [...prev, entry];
        // Keep only the most recent entries
        if (newEntries.length > maxEntries) {
          return newEntries.slice(-maxEntries);
        }
        return newEntries;
      });
    });

    return unsubscribe;
  }, [maxEntries]);

  return entries;
}
