// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://b2d14d69bd0b4eb23548c0e522ef99b5@o4508130833793024.ingest.us.sentry.io/4510105426853888",

  tracesSampleRate: 1,
  spotlight: true,
  integrations: [
    Sentry.spotlightIntegration(),
    Sentry.claudeCodeIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
  ],

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Enable sending PII to capture prompts and responses
  sendDefaultPii: true,
});
