"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useSession } from "@/lib/auth-client";

// Local mode user - matches server-side LOCAL_USER
const LOCAL_USER = {
  id: "00000000-0000-0000-0000-000000000000",
  name: "Local User",
  email: "local@localhost",
  emailVerified: true,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as const;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isLocalMode: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
  isLocalMode?: boolean;
}

export function AuthProvider({ children, isLocalMode = false }: AuthProviderProps) {
  const { data: session, isPending } = useSession();

  const value = useMemo<AuthContextValue>(() => {
    // In local mode, always authenticated as local user
    if (isLocalMode) {
      return {
        user: LOCAL_USER,
        isAuthenticated: true,
        isLoading: false,
        isLocalMode: true,
      };
    }

    // Normal mode - use better-auth session
    return {
      user: session?.user ? {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        image: session.user.image ?? null,
        createdAt: new Date(session.user.createdAt),
        updatedAt: new Date(session.user.updatedAt),
      } : null,
      isAuthenticated: !!session?.user,
      isLoading: isPending,
      isLocalMode: false,
    };
  }, [session, isPending, isLocalMode]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

/**
 * Hook to check if user can perform protected actions
 * Returns true if authenticated or in local mode
 */
export function useCanPerformActions(): boolean {
  const { isAuthenticated, isLocalMode } = useAuth();
  return isAuthenticated || isLocalMode;
}
