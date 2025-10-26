import * as Sentry from "@sentry/node";

type RunnerSentryOptions = NonNullable<Parameters<typeof Sentry.init>[0]> & {
  dsn: string;
  integrations?: Array<
    | ReturnType<typeof Sentry.claudeCodeIntegration>
    | ReturnType<typeof Sentry.openaiCodexIntegration>
    | ReturnType<typeof Sentry.consoleLoggingIntegration>
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
    Sentry.httpIntegration(), // For HTTP trace propagation
  ],
  tracesSampleRate: 1.0,
  enableLogs: true,
  debug: false,
  sendDefaultPii: true,

  // Configure trace propagation
  tracePropagationTargets: [
    'localhost',
    'localhost:3000',
    'localhost:4000',
    /^https?:\/\/localhost:\d+$/,
  ],
};

Sentry.init(sentryOptions);
