import * as Sentry from '@sentry/node';

// Initialize Sentry FIRST before any other imports
Sentry.init({
  dsn: process.env.SENTRY_DSN || 'https://14836e3c83b298b446f1f27df5d9972f@o4508130833793024.ingest.us.sentry.io/4510251614339072',

  // Performance monitoring
  tracesSampleRate: 1.0,

  integrations: [
    Sentry.httpIntegration(), // For HTTP trace propagation
  ],

  // Configure trace propagation for outgoing HTTP to Next.js
  tracePropagationTargets: [
    'localhost',
    'localhost:3000',
    /^https?:\/\/localhost:\d+$/,
  ],

  // Environment
  environment: process.env.NODE_ENV || 'development',

  // Send user IP and other PII for better debugging (disable if privacy-sensitive)
  sendDefaultPii: true,

  // Release tracking (optional - useful for correlating errors with deployments)
  release: process.env.SENTRY_RELEASE || undefined,
});

export { Sentry };
