'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface RunnerConnection {
  runnerId: string;
  lastHeartbeat: number;
}

interface RunnerContextType {
  selectedRunnerId: string;
  setSelectedRunnerId: (id: string) => void;
  availableRunners: RunnerConnection[];
  isLoading: boolean;
  refetchRunners: () => Promise<void>;
}

const RunnerContext = createContext<RunnerContextType | undefined>(undefined);

export function RunnerProvider({ children }: { children: ReactNode }) {
  const [selectedRunnerId, setSelectedRunnerId] = useState<string>(
    () => {
      // Try to load from localStorage
      if (typeof window !== 'undefined') {
        return localStorage.getItem('selectedRunnerId') || (process.env.NEXT_PUBLIC_RUNNER_DEFAULT_ID ?? 'default');
      }
      return process.env.NEXT_PUBLIC_RUNNER_DEFAULT_ID ?? 'default';
    }
  );
  const [availableRunners, setAvailableRunners] = useState<RunnerConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRunners = async () => {
    try {
      const res = await fetch('/api/runner/status');
      if (res.ok) {
        const data = await res.json();
        setAvailableRunners(data.connections || []);

        // If selected runner is no longer available, fall back to first available or default
        if (data.connections && data.connections.length > 0) {
          const selectedExists = data.connections.some((r: RunnerConnection) => r.runnerId === selectedRunnerId);
          if (!selectedExists) {
            const fallback = data.connections[0].runnerId;
            console.log(`⚠️ Selected runner ${selectedRunnerId} not found, falling back to ${fallback}`);
            setSelectedRunnerId(fallback);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch runners:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch runners on mount and poll every 10 seconds
  useEffect(() => {
    fetchRunners();
    const interval = setInterval(fetchRunners, 10000);
    return () => clearInterval(interval);
  }, []);

  // Save selected runner to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedRunnerId', selectedRunnerId);
    }
  }, [selectedRunnerId]);

  return (
    <RunnerContext.Provider
      value={{
        selectedRunnerId,
        setSelectedRunnerId,
        availableRunners,
        isLoading,
        refetchRunners: fetchRunners,
      }}
    >
      {children}
    </RunnerContext.Provider>
  );
}

export function useRunner() {
  const context = useContext(RunnerContext);
  if (!context) {
    // During SSR or initial hydration, return safe defaults instead of throwing
    // This prevents "availableRunners is not defined" errors
    return {
      selectedRunnerId: process.env.NEXT_PUBLIC_RUNNER_DEFAULT_ID ?? 'default',
      setSelectedRunnerId: () => {
        console.warn('useRunner: setSelectedRunnerId called before RunnerProvider initialized');
      },
      availableRunners: [],
      isLoading: true,
      refetchRunners: async () => {
        console.warn('useRunner: refetchRunners called before RunnerProvider initialized');
      },
    };
  }
  return context;
}
