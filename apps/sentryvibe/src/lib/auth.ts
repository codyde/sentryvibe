import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@sentryvibe/agent-core";
import { users, sessions, accounts, verifications } from "@sentryvibe/agent-core/lib/db/schema";

// Default secret for local development - in production, BETTER_AUTH_SECRET must be set
const SECRET = process.env.BETTER_AUTH_SECRET || (
  process.env.SENTRYVIBE_LOCAL_MODE === "true" 
    ? "local-development-secret-do-not-use-in-production" 
    : undefined
);

if (!SECRET && process.env.NODE_ENV === "production") {
  console.error("BETTER_AUTH_SECRET must be set in production!");
}

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
