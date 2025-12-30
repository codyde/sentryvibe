import { auth } from "./auth";
import { headers } from "next/headers";
import { db } from "@sentryvibe/agent-core";
import { projects, runnerKeys } from "@sentryvibe/agent-core/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { createHash } from "crypto";

// Local mode user - used when SENTRYVIBE_LOCAL_MODE is true
export const LOCAL_USER = {
  id: "00000000-0000-0000-0000-000000000000",
  name: "Local User",
  email: "local@localhost",
  emailVerified: true,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as const;

export const LOCAL_SESSION = {
  user: LOCAL_USER,
  session: {
    id: "local-session",
    userId: LOCAL_USER.id,
    token: "local-token",
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), // 1 year
    ipAddress: "127.0.0.1",
    userAgent: "local",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
} as const;

/**
 * Check if running in local mode
 */
export function isLocalMode(): boolean {
  return process.env.SENTRYVIBE_LOCAL_MODE === "true";
}

/**
 * Get the current session from the request
 * Returns LOCAL_SESSION in local mode, otherwise checks better-auth session
 */
export async function getSession() {
  if (isLocalMode()) {
    return LOCAL_SESSION;
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session;
}

/**
 * Require authentication - throws if not authenticated
 * Returns the session if authenticated
 */
export async function requireAuth() {
  const session = await getSession();

  if (!session) {
    throw new AuthError("Unauthorized", 401);
  }

  return session;
}

/**
 * Get user ID from session, or null if not authenticated
 */
export async function getUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}

/**
 * Verify that the current user owns the project
 * In local mode, always returns the project (no ownership check)
 * For projects without userId (legacy), allows access if user is authenticated
 */
export async function requireProjectOwnership(projectId: string) {
  const session = await requireAuth();
  const userId = session.user.id;

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) {
    throw new AuthError("Project not found", 404);
  }

  // Local mode - allow access to all projects
  if (isLocalMode()) {
    return { project, session };
  }

  // Project has no owner (legacy) - allow authenticated users
  if (!project.userId) {
    return { project, session };
  }

  // Check ownership
  if (project.userId !== userId) {
    throw new AuthError("Forbidden", 403);
  }

  return { project, session };
}

/**
 * Hash a runner key for storage/lookup
 */
export function hashRunnerKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Generate a new runner key
 * Format: sv_<32 random hex characters>
 */
export function generateRunnerKey(): string {
  const randomBytes = createHash("sha256")
    .update(crypto.randomUUID() + Date.now().toString())
    .digest("hex")
    .substring(0, 32);
  return `sv_${randomBytes}`;
}

/**
 * Get the key prefix for display (first 12 chars including sv_)
 */
export function getKeyPrefix(key: string): string {
  return key.substring(0, 12) + "...";
}

/**
 * Authenticate a runner by its key
 * Returns the user ID associated with the key, or null if invalid
 */
export async function authenticateRunnerKey(key: string): Promise<{
  userId: string;
  keyId: string;
} | null> {
  // In local mode, runner auth is not required
  if (isLocalMode()) {
    return {
      userId: LOCAL_USER.id,
      keyId: "local",
    };
  }

  if (!key || !key.startsWith("sv_")) {
    return null;
  }

  const keyHash = hashRunnerKey(key);

  const runnerKey = await db.query.runnerKeys.findFirst({
    where: and(
      eq(runnerKeys.keyHash, keyHash),
      isNull(runnerKeys.revokedAt)
    ),
  });

  if (!runnerKey) {
    return null;
  }

  // Update last used timestamp (fire and forget)
  db.update(runnerKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(runnerKeys.id, runnerKey.id))
    .execute()
    .catch(() => {}); // Ignore errors

  return {
    userId: runnerKey.userId,
    keyId: runnerKey.id,
  };
}

/**
 * Extract runner key from Authorization header
 * Only extracts tokens that are runner keys (prefixed with "sv_")
 * Returns null for other tokens (e.g., shared secrets) so they can be handled separately
 */
export function extractRunnerKey(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return null;

  // Support both "Bearer sv_xxx" and just "sv_xxx"
  if (authHeader.startsWith("Bearer sv_")) {
    return authHeader.substring(7); // Returns "sv_xxx"
  }

  if (authHeader.startsWith("sv_")) {
    return authHeader;
  }

  // Not a runner key (could be shared secret or other token)
  return null;
}

/**
 * Custom error class for auth errors
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Handle auth errors in API routes
 */
export function handleAuthError(error: unknown): Response {
  if (error instanceof AuthError) {
    return Response.json(
      { error: error.message },
      { status: error.statusCode }
    );
  }

  console.error("Unexpected auth error:", error);
  return Response.json(
    { error: "Internal server error" },
    { status: 500 }
  );
}
