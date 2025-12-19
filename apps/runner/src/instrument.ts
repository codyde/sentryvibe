import * as Sentry from "@sentry/node";

type RunnerSentryOptions = NonNullable<Parameters<typeof Sentry.init>[0]> & {
  dsn: string;
  integrations?: Array<
    | ReturnType<typeof Sentry.claudeCodeAgentSdkIntegration>
    | ReturnType<typeof Sentry.openAIIntegration>
    | ReturnType<typeof Sentry.httpIntegration>
  >;
  tracesSampleRate?: number;
  debug?: boolean;
  enableLogs?: boolean;
  sendDefaultPii?: boolean;
  tracePropagationTargets?: Array<string | RegExp>;
};

const sentryOptions: RunnerSentryOptions = {
  dsn: "https://94f02492541e36eaa9ebfa56c4c042d2@o4508130833793024.ingest.us.sentry.io/4510156711919616",
  integrations: [
    // Claude Code Agent SDK integration - auto-patches query function via OpenTelemetry
    Sentry.claudeCodeAgentSdkIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
    Sentry.vercelAIIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
    // OpenAI integration
    Sentry.openAIIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
    Sentry.httpIntegration(), // For HTTP trace propagation
  ],
  tracesSampleRate: 1.0,
  enableLogs: true,
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
};

Sentry.init(sentryOptions);
