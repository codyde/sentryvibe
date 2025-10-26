import * as Sentry from "@sentry/node";

type RunnerSentryOptions = NonNullable<Parameters<typeof Sentry.init>[0]> & {
  dsn: string;
  integrations?: Array<
    | ReturnType<typeof Sentry.claudeCodeIntegration>
    | ReturnType<typeof Sentry.openaiCodexIntegration>
    | ReturnType<typeof Sentry.consoleLoggingIntegration>
  >;
  tracesSampleRate?: number;
  debug?: boolean;
  enableLogs?: boolean;
  sendDefaultPii?: boolean;
};

const sentryOptions: RunnerSentryOptions = {
  dsn: "https://94f02492541e36eaa9ebfa56c4c042d2@o4508130833793024.ingest.us.sentry.io/4510156711919616",
  integrations: [
    // Claude Code integration with AI SDK provider support
    Sentry.claudeCodeIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
    // OpenAI Codex integration
    Sentry.openaiCodexIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
    Sentry.consoleLoggingIntegration(),
  ],
  tracesSampleRate: 1.0,
  enableLogs: true,
  debug: false,
  sendDefaultPii: true,
};

Sentry.init(sentryOptions);
