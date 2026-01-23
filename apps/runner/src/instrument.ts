import * as Sentry from "@sentry/node";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SentryAny = Sentry as any;

// Debug logging for instrumentation (enabled via DEBUG_SENTRY=1)
const debugSentry = process.env.DEBUG_SENTRY === '1';
const log = (msg: string) => debugSentry && console.log(`[sentry-instrument] ${msg}`);

// Build integrations array, gracefully handling missing custom integrations
// Custom integrations (claudeCodeAgentSdkIntegration, vercelAIIntegration, openAIIntegration)
// are only available in the vendored Sentry SDK, not the public npm version
const integrations: unknown[] = [];

// Always add http integration (available in all versions)
if (typeof Sentry.httpIntegration === "function") {
  integrations.push(Sentry.httpIntegration());
  log('✓ Added httpIntegration');
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
  log(`✓ Added claudeCodeAgentSdkIntegration (agentName: ${useOpenCodeSdk ? 'opencode' : 'claude-code'})`);
} else {
  log('✗ claudeCodeAgentSdkIntegration NOT available - AI spans will use manual instrumentation');
}

if (typeof SentryAny.vercelAIIntegration === "function") {
  integrations.push(
    SentryAny.vercelAIIntegration({
      recordInputs: true,
      recordOutputs: true,
    })
  );
  log('✓ Added vercelAIIntegration');
} else {
  log('✗ vercelAIIntegration NOT available');
}

if (typeof SentryAny.openAIIntegration === "function") {
  integrations.push(
    SentryAny.openAIIntegration({
      recordInputs: true,
      recordOutputs: true,
    })
  );
  log('✓ Added openAIIntegration');
} else {
  log('✗ openAIIntegration NOT available');
}

log(`Total integrations configured: ${integrations.length}`);

Sentry.init({
  dsn: process.env.SENTRY_DSN,
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
    "openbuilder.app",
    "openbuilder.up.railway.app",
    "broker.openbuilder.app",
    "broker.up.railway.app",

    // Wildcard patterns for Railway
    /^https?:\/\/.*\.railway\.app/, // Railway deployments
    /^https?:\/\/.*\.up\.railway\.app/, // Railway preview deployments
    /^https?:\/\/.*\.openbuilder\.app/, // Custom domain subdomains
  ],
});
