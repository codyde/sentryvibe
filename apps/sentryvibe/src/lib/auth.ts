import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@sentryvibe/agent-core";
import { users, sessions, accounts, verifications } from "@sentryvibe/agent-core/lib/db/schema";

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

const SECRET = getAuthSecret();

/**
 * Better-auth server configuration
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
export const auth = betterAuth({
  secret: SECRET,
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
  trustedOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
