// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://b2d14d69bd0b4eb23548c0e522ef99b5@o4508130833793024.ingest.us.sentry.io/4510105426853888",

  spotlight: true,
  integrations: [
    Sentry.spotlightIntegration(),
    Sentry.consoleLoggingIntegration(),
    Sentry.postgresIntegration(), // Automatic tracing for PostgreSQL queries
    Sentry.claudeCodeIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
    Sentry.openaiCodexIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
  ],

  _experiments: {
    enableMetrics: true,
  },

  // Use tracesSampler instead of tracesSampleRate for granular control
  tracesSampler: ({ name, attributes }) => {
    // Never trace runner status polling endpoints - these pollute traces
    if (name?.includes('/api/runner/status')) {
      return 0;
    }
    
    // Never trace status-stream SSE connections - these are long-lived
    if (name?.includes('/status-stream')) {
      return 0;
    }
    
    // Sample everything else at 100%
    return 1.0;
  },

  tracePropagationTargets: [
    // Local development
    'localhost',
    'localhost:4000',
    /^https?:\/\/localhost:\d+$/,
    
    // Production domains (NextJS → Broker communication)
    'sentryvibe.app',
    'sentryvibe.up.railway.app',
    'broker.sentryvibe.app',
    'broker.up.railway.app',
    
    // Wildcard patterns for Railway
    /^https?:\/\/.*\.railway\.app/,      // Railway deployments
    /^https?:\/\/.*\.up\.railway\.app/,  // Railway preview deployments
    /^https?:\/\/.*\.sentryvibe\.app/,   // Custom domain subdomains
  ],

  enableLogs: true,

  debug: false,

  sendDefaultPii: true,
});
