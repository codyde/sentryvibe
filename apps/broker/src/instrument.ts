import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// Initialize Sentry FIRST before any other imports
Sentry.init({
  dsn: process.env.SENTRY_DSN || 'https://14836e3c83b298b446f1f27df5d9972f@o4508130833793024.ingest.us.sentry.io/4510251614339072',

  // Profiling
  profilesSampleRate: 1.0,
  integrations: [
    nodeProfilingIntegration(),
    Sentry.httpIntegration(), // For HTTP trace propagation
  ],

  // Use tracesSampler instead of tracesSampleRate for granular control
  tracesSampler: ({ name }) => {
    // Never trace health/status/metrics endpoints - these are high-frequency monitoring
    if (name?.includes('/health') || name?.includes('/status') || name?.includes('/metrics')) {
      return 0;
    }
    
    // Sample everything else at 100%
    return 1.0;
  },

  // Configure trace propagation for outgoing HTTP to Next.js
  // This tells Sentry to automatically add trace headers to these URLs
  tracePropagationTargets: [
    'localhost',
    'localhost:3000',
    /^https?:\/\/localhost:\d+$/,
    /^https?:\/\/.*\.railway\.app/, // Railway deployments
    /^https?:\/\/.*\.up\.railway\.app/, // Railway custom domains
    ...(process.env.EVENT_TARGET ? [process.env.EVENT_TARGET] : []), // Explicit target from env
  ],

  // Environment
  environment: process.env.NODE_ENV || 'development',

  // Send user IP and other PII for better debugging (disable if privacy-sensitive)
  sendDefaultPii: true,

  // Release tracking (optional - useful for correlating errors with deployments)
  release: process.env.SENTRY_RELEASE || undefined,
});

export { Sentry };
