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
 */
export const auth = betterAuth({
  secret: SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { users, sessions, accounts, verifications },
    // Tell drizzle adapter to use snake_case column mapping
    usePlural: true,
  }),
  // Map better-auth field names to our snake_case database columns
  user: {
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  session: {
    fields: {
      userId: "user_id",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    expiresIn: 60 * 60 * 24 * 7, // 7 days in seconds
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },
  account: {
    fields: {
      userId: "user_id",
      accountId: "account_id",
      providerId: "provider_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      idToken: "id_token",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
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
