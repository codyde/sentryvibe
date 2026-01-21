import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";
import { db } from "@sentryvibe/agent-core";
import { users, sessions, accounts, verifications } from "@sentryvibe/agent-core/lib/db/schema";

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
  
  // In local mode, use a default development secret
  if (process.env.SENTRYVIBE_LOCAL_MODE === "true") {
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
  return betterAuth({
    secret: getAuthSecret(),
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { users, sessions, accounts, verifications },
      usePlural: true,
    }),
    // Let PostgreSQL generate UUIDs (our schema has defaultRandom())
    advanced: {
      database: {
        generateId: false,
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
    // Sentry OAuth plugin
    plugins: [
      genericOAuth({
        config: [
          {
            providerId: "sentry",
            clientId: process.env.SENTRY_OAUTH_CLIENT_ID!,
            clientSecret: process.env.SENTRY_OAUTH_CLIENT_SECRET!,
            authorizationUrl: "https://sentry.io/oauth/authorize/",
            tokenUrl: "https://sentry.io/oauth/token/",
            scopes: ["openid", "profile", "email"],
            pkce: true,
            getUserInfo: async (tokens) => {
              // Sentry returns user info in the token response
              const raw = tokens.raw as Record<string, unknown>;
              const user = raw.user as { id: string; name: string; email: string };
              return {
                id: user.id,
                email: user.email,
                name: user.name,
                emailVerified: true,
              };
            },
          },
        ],
      }),
    ],
    trustedOrigins: getTrustedOrigins(),
  });
}

/**
 * Get the better-auth instance (lazy initialized)
 * 
 * This is lazy to avoid errors during Next.js build phase when
 * environment variables may not be available.
 * 
 * This configures authentication with:
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
