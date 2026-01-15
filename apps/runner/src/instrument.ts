import * as Sentry from "@sentry/node";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SentryAny = Sentry as any;

// Build integrations array, gracefully handling missing custom integrations
// Custom integrations (claudeCodeAgentSdkIntegration, vercelAIIntegration, openAIIntegration)
// are only available in the vendored Sentry SDK, not the public npm version
const integrations: unknown[] = [];

// Always add http integration (available in all versions)
if (typeof Sentry.httpIntegration === "function") {
  integrations.push(Sentry.httpIntegration());
}

// Add custom integrations if available (vendored SDK only)
// Use 'opencode' as agent name when OpenCode SDK is enabled for better Sentry visibility
const useOpenCodeSdk = process.env.USE_OPENCODE_SDK === '1' && !!process.env.OPENCODE_URL;
if (typeof SentryAny.claudeCodeAgentSdkIntegration === "function") {
  integrations.push(
    SentryAny.claudeCodeAgentSdkIntegration({
      recordInputs: true,
      recordOutputs: true,
      agentName: useOpenCodeSdk ? 'opencode' : 'claude-code',
    })
  );
}

if (typeof SentryAny.vercelAIIntegration === "function") {
  integrations.push(
    SentryAny.vercelAIIntegration({
      recordInputs: true,
      recordOutputs: true,
    })
  );
}

if (typeof SentryAny.openAIIntegration === "function") {
  integrations.push(
    SentryAny.openAIIntegration({
      recordInputs: true,
      recordOutputs: true,
    })
  );
}

Sentry.init({
  dsn: "https://94f02492541e36eaa9ebfa56c4c042d2@o4508130833793024.ingest.us.sentry.io/4510156711919616",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  integrations: integrations as any[],
  tracesSampleRate: 1.0,
  debug: false,
  sendDefaultPii: false,
  // Configure trace propagation (Runner → Broker communication)
  tracePropagationTargets: [
    // Local development
    "localhost",
    "localhost:3000",
    "localhost:4000",
    /^https?:\/\/localhost:\d+$/,

    // Production domains
    "sentryvibe.app",
    "sentryvibe.up.railway.app",
    "broker.sentryvibe.app",
    "broker.up.railway.app",

    // Wildcard patterns for Railway
    /^https?:\/\/.*\.railway\.app/, // Railway deployments
    /^https?:\/\/.*\.up\.railway\.app/, // Railway preview deployments
    /^https?:\/\/.*\.sentryvibe\.app/, // Custom domain subdomains
  ],
});
