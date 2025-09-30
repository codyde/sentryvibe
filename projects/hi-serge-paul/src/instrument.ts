import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "https://2087e7f95afa329aa20cfe04f49c7dfb@o4508130833793024.ingest.us.sentry.io/4510107301904384",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
    Sentry.captureConsoleIntegration({
      levels: ['log', 'info', 'warn', 'error', 'debug', 'assert'],
    }),
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  enableLogs: true,
});