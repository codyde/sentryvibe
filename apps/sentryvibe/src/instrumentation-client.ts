// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://b2d14d69bd0b4eb23548c0e522ef99b5@o4508130833793024.ingest.us.sentry.io/4510105426853888",
spotlight: true,
  // Add optional integrations for additional features
  integrations: [
    Sentry.spotlightBrowserIntegration(),
    Sentry.consoleLoggingIntegration(),
    Sentry.replayIntegration({
      maskAllText: false,
      maskAllInputs: false,
    }),
  ],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 1.0,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
  tracePropagationTargets: [
    'localhost',
    'localhost:4000',
    /^\/api\//,
    /^https?:\/\/localhost:\d+$/,
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;