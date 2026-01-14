import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@sentryvibe/agent-core/lib/db/client";
import { isLocalMode } from "@sentryvibe/agent-core";
import { users, sessions, accounts, verifications } from "@sentryvibe/agent-core/lib/db/schema";

// ============================================================================
// Local Mode: No Authentication Required
// ============================================================================
// In local mode (MODE=LOCAL), we skip all authentication.
// A synthetic "local user" is returned for all auth checks.
// ============================================================================

/**
 * Default local user for single-user local mode
 */
export const LOCAL_USER: User = {
  id: "local-user-00000000-0000-0000-0000-000000000000",
  email: "local@sentryvibe.local",
  emailVerified: true,
  name: "Local User",
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/**
 * Default local session for single-user local mode
 */
export const LOCAL_SESSION: Session = {
  session: {
    id: "local-session-00000000-0000-0000-0000-000000000000",
    userId: LOCAL_USER.id,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    token: "local-token",
    createdAt: new Date(),
    updatedAt: new Date(),
    ipAddress: "127.0.0.1",
    userAgent: "SentryVibe Local",
  },
  user: LOCAL_USER,
};

// ============================================================================
// Hosted Mode: Full Better-Auth Authentication
// ============================================================================

// Get trusted origins for CORS/auth
function getTrustedOrigins(): string[] {
  const origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://sentryvibe.app",
  ];
  
  // Add custom origins from environment variable (comma-separated)
  if (process.env.TRUSTED_ORIGINS) {
    const customOrigins = process.env.TRUSTED_ORIGINS.split(",").map(o => o.trim());
    origins.push(...customOrigins);
  }
  
  return origins;
}

// Determine the auth secret based on environment
function getAuthSecret(): string {
  // Use explicitly set secret if available
  if (process.env.BETTER_AUTH_SECRET) {
    return process.env.BETTER_AUTH_SECRET;
  }
  
  // In local mode, use a default development secret (auth is skipped anyway)
  if (isLocalMode()) {
    return "local-development-secret-do-not-use-in-production";
  }
  
  // In hosted/production mode without a secret, fail fast
  throw new Error(
    "BETTER_AUTH_SECRET environment variable must be set in hosted mode. " +
    "Generate a secure secret with: openssl rand -base64 32"
  );
}

// Lazy-initialized auth instance
// This prevents errors during Next.js build/page collection phases
let _auth: ReturnType<typeof betterAuth> | null = null;

function createAuth() {
  // In local mode, we still create a minimal auth instance
  // but it won't be used for actual authentication
  return betterAuth({
    secret: getAuthSecret(),
    database: drizzleAdapter(db as any, {
      provider: isLocalMode() ? "sqlite" : "pg",
      schema: { users, sessions, accounts, verifications },
      usePlural: true,
    }),
    // Let PostgreSQL generate UUIDs (our schema has defaultRandom())
    // For SQLite, we generate UUIDs in the schema with $defaultFn
    advanced: {
      database: {
        generateId: isLocalMode() ? undefined : false,
      },
    },
    // Session configuration
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days in seconds
      updateAge: 60 * 60 * 24, // Update session every 24 hours
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // 5 minutes
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    trustedOrigins: getTrustedOrigins(),
  });
}

/**
 * Get the better-auth instance (lazy initialized)
 * 
 * In LOCAL mode, this returns a minimal auth instance that won't be used
 * for actual authentication (all requests get LOCAL_SESSION/LOCAL_USER).
 * 
 * In HOSTED mode, this configures authentication with:
 * - Email/password credentials
 * - PostgreSQL session storage via Drizzle
 * - 7-day session duration
 * 
 * Per better-auth docs: Field names are mapped based on the Drizzle schema
 * property names (e.g., `emailVerified: boolean('email_verified')` means
 * better-auth uses `emailVerified` and Drizzle maps it to `email_verified` column).
 * 
 * We use `usePlural: true` since our tables are named `users`, `sessions`, etc.
 */
export function getAuth() {
  if (!_auth) {
    _auth = createAuth();
  }
  return _auth;
}

/**
 * Check if the current mode requires authentication
 */
export function requiresAuth(): boolean {
  return !isLocalMode();
}

/**
 * Get the current session - returns LOCAL_SESSION in local mode
 * This is a convenience function for use in API routes
 */
export async function getCurrentSession(headers: Headers): Promise<Session | null> {
  if (isLocalMode()) {
    return LOCAL_SESSION;
  }
  
  const auth = getAuth();
  const session = await auth.api.getSession({ headers });
  return session;
}

/**
 * Get the current user - returns LOCAL_USER in local mode
 * This is a convenience function for use in API routes
 */
export async function getCurrentUser(headers: Headers): Promise<User | null> {
  const session = await getCurrentSession(headers);
  return session?.user ?? null;
}

// Type exports for session/user
export type Session = {
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    token: string;
    createdAt: Date;
    updatedAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    name: string;
    image?: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
};
export type User = Session["user"];
