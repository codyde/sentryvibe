// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://b2d14d69bd0b4eb23548c0e522ef99b5@o4508130833793024.ingest.us.sentry.io/4510105426853888",
  // Sample all traces for metrics and performance monitoring
  tracesSampleRate: 1.0,

  integrations: [
    Sentry.claudeCodeAgentSdkIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
    Sentry.openAIIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
  ],

  // Use tracesSampler for granular control to reduce noise
  tracesSampler: ({ name, attributes }) => {
    // Never trace polling endpoints - these create excessive span noise
    if (name?.includes('/api/runner/status')) {
      return 0; // Polled every 10s
    }

    if (name?.includes('/api/runner/process/list')) {
      return 0; // Polled frequently for process health checks - no value
    }

    if (name?.includes('/api/processes')) {
      return 0; // Polled every 5s when modal open
    }

    // Never trace SSE/streaming connections - these are long-lived
    if (name?.includes('/status-stream')) {
      return 0;
    }

    // Default: sample most routes at 50% to reduce overall volume
    return 1;
  },

  tracePropagationTargets: [
    // Local development
    'localhost',
    /^https?:\/\/localhost:\d+$/,
    
    // Production domains (NextJS → Broker communication)
    'shipbuilder.app',
    'shipbuilder.up.railway.app',
    // Wildcard patterns for Railway
    /^https?:\/\/.*\.railway\.app/,      // Railway deployments
    /^https?:\/\/.*\.up\.railway\.app/,  // Railway preview deployments
    /^https?:\/\/.*\.shipbuilder\.app/,   // Custom domain subdomains
  ],

  enableLogs: true,

  sendDefaultPii: false,
});