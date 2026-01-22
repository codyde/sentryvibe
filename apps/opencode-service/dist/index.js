#!/usr/bin/env node
import express from 'express';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { createOpencode } from '@opencode-ai/sdk';
import * as Sentry from '@sentry/node';
import { createHash } from 'crypto';
import { db } from '@shipbuilder/agent-core';
import { runnerKeys } from '@shipbuilder/agent-core/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

function isLocalMode() {
  return process.env.SHIPBUILDER_LOCAL_MODE === "true";
}
function hashRunnerKey(key) {
  return createHash("sha256").update(key).digest("hex");
}
async function authenticateRunnerKey(key) {
  if (isLocalMode()) {
    return {
      authenticated: true,
      userId: "00000000-0000-0000-0000-000000000000",
      keyId: "local"
    };
  }
  if (!key || !key.startsWith("sv_")) {
    return {
      authenticated: false,
      error: "Invalid runner key format"
    };
  }
  try {
    const keyHash = hashRunnerKey(key);
    const result = await db.select({
      id: runnerKeys.id,
      userId: runnerKeys.userId
    }).from(runnerKeys).where(
      and(
        eq(runnerKeys.keyHash, keyHash),
        isNull(runnerKeys.revokedAt)
      )
    ).limit(1);
    if (result.length > 0) {
      const row = result[0];
      db.update(runnerKeys).set({ lastUsedAt: /* @__PURE__ */ new Date() }).where(eq(runnerKeys.id, row.id)).catch(() => {
      });
      return {
        authenticated: true,
        userId: row.userId,
        keyId: row.id
      };
    }
    return {
      authenticated: false,
      error: "Invalid or revoked runner key"
    };
  } catch (error) {
    console.error("[opencode-service] Error validating runner key:", error);
    return {
      authenticated: false,
      error: "Failed to validate runner key"
    };
  }
}
function extractRunnerKey(headers) {
  const authHeader = headers["authorization"];
  if (!authHeader) return null;
  const auth = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!auth) return null;
  if (auth.startsWith("Bearer sv_")) {
    return auth.substring(7);
  }
  if (auth.startsWith("sv_")) {
    return auth;
  }
  return null;
}
function extractToken(headers) {
  const authHeader = headers["authorization"];
  if (!authHeader) return null;
  const auth = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!auth) return null;
  if (auth.startsWith("Bearer ")) {
    return auth.substring(7);
  }
  return auth;
}
async function authenticateRequest(headers) {
  if (isLocalMode()) {
    return {
      authenticated: true,
      userId: "00000000-0000-0000-0000-000000000000"
    };
  }
  const runnerKey = extractRunnerKey(headers);
  if (runnerKey) {
    return authenticateRunnerKey(runnerKey);
  }
  const token = extractToken(headers);
  const sharedSecret = process.env.RUNNER_SHARED_SECRET;
  if (sharedSecret && token === sharedSecret) {
    return {
      authenticated: true
    };
  }
  return {
    authenticated: false,
    error: "No valid authentication provided"
  };
}

// src/index.ts
var PORT = parseInt(process.env.OPENCODE_SERVICE_PORT || "4096", 10);
var INTERNAL_PORT = parseInt(process.env.OPENCODE_INTERNAL_PORT || "4097", 10);
var HOST = process.env.OPENCODE_SERVICE_HOST || "0.0.0.0";
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1
  });
}
async function main() {
  console.log("[opencode-service] Starting OpenCode service...");
  console.log(`[opencode-service] Local mode: ${isLocalMode()}`);
  console.log(`[opencode-service] Starting internal OpenCode server on port ${INTERNAL_PORT}...`);
  let opencodeInstance = null;
  try {
    opencodeInstance = await createOpencode({
      hostname: "127.0.0.1",
      port: INTERNAL_PORT,
      timeout: 3e4,
      // 30 second timeout for server start
      config: {
        // Default model - can be overridden per request
        model: process.env.OPENCODE_DEFAULT_MODEL || "anthropic/claude-sonnet-4-5"
      }
    });
    console.log(`[opencode-service] Internal OpenCode server started at ${opencodeInstance.server.url}`);
  } catch (error) {
    console.error("[opencode-service] Failed to start internal OpenCode server:", error);
    console.error("[opencode-service] Make sure opencode-ai is installed globally or the opencode CLI is available");
    process.exit(1);
  }
  const app = express();
  app.get("/health", async (_req, res) => {
    try {
      const client = opencodeInstance?.client;
      const health = await client?.global?.health?.();
      res.json({
        status: "healthy",
        opencode: health?.data,
        service: {
          port: PORT,
          internalPort: INTERNAL_PORT,
          localMode: isLocalMode()
        }
      });
    } catch (error) {
      res.status(503).json({
        status: "unhealthy",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  app.use(async (req, res, next) => {
    if (req.path === "/health") {
      return next();
    }
    const authResult = await authenticateRequest(req.headers);
    if (!authResult.authenticated) {
      console.log(`[opencode-service] Auth failed: ${authResult.error}`);
      return res.status(401).json({
        error: "Unauthorized",
        message: authResult.error
      });
    }
    req.auth = {
      userId: authResult.userId,
      keyId: authResult.keyId
    };
    next();
  });
  app.use((req, _res, next) => {
    const auth = req.auth;
    console.log(`[opencode-service] ${req.method} ${req.path} [user: ${auth?.userId || "unknown"}]`);
    next();
  });
  const proxy = createProxyMiddleware({
    target: `http://127.0.0.1:${INTERNAL_PORT}`,
    changeOrigin: true,
    ws: true,
    // Enable WebSocket proxying for SSE
    on: {
      proxyReq: fixRequestBody,
      error: (err, _req, res) => {
        console.error("[opencode-service] Proxy error:", err);
        if (res && "writeHead" in res) {
          res.status(502).json({
            error: "Proxy error",
            message: err.message
          });
        }
      }
    }
  });
  app.use("/", proxy);
  const server = app.listen(PORT, HOST, () => {
    console.log(`[opencode-service] Service listening on http://${HOST}:${PORT}`);
    console.log("[opencode-service] Ready to accept requests");
  });
  const shutdown = async (signal) => {
    console.log(`[opencode-service] Received ${signal}, shutting down...`);
    server.close(() => {
      console.log("[opencode-service] HTTP server closed");
    });
    if (opencodeInstance) {
      try {
        opencodeInstance.server.close();
        console.log("[opencode-service] Internal OpenCode server closed");
      } catch (error) {
        console.error("[opencode-service] Error closing OpenCode server:", error);
      }
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
main().catch((error) => {
  console.error("[opencode-service] Fatal error:", error);
  Sentry.captureException(error);
  process.exit(1);
});
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map