import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "https://58d64ed4062cb0e0b480bd3128900012@o4508130833793024.ingest.us.sentry.io/4510110441668608",

  // Adds request headers and IP for users
  sendDefaultPii: true,

  integrations: [
    // Performance monitoring - browser tracing
    Sentry.browserTracingIntegration(),
    
    // Session Replay - captures user interactions
    Sentry.replayIntegration(),
  ],

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for tracing.
  // Lower this in production (e.g., 0.1 for 10%)
  tracesSampleRate: 1.0,

  // Set `tracePropagationTargets` to control for which URLs trace propagation should be enabled
  tracePropagationTargets: [/^\//, /^https:\/\/yourserver\.io\/api/],

  // Capture Replay for 10% of all sessions,
  // plus for 100% of sessions with an error
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
