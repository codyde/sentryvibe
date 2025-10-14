import * as Sentry from "@sentry/node";

Sentry.init({
    dsn: "https://94f02492541e36eaa9ebfa56c4c042d2@o4508130833793024.ingest.us.sentry.io/4510156711919616",
    // Note: claudeCodeIntegration only available in vendor tarballs (local dev)
    // For global CLI install, uses standard Sentry without Claude integration
    integrations: [
        // @ts-ignore - claudeCodeIntegration may not exist in published version
        ...(typeof Sentry.claudeCodeIntegration === 'function'
          ? [Sentry.claudeCodeIntegration({ recordInputs: true, recordOutputs: true })]
          : []
        ),
      ],
    tracesSampleRate: 1.0,
    debug: false,
    enableLogs: true,
    sendDefaultPii: true,
  });
