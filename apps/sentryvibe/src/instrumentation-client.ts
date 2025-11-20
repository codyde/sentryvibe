// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: "https://b2d14d69bd0b4eb23548c0e522ef99b5@o4508130833793024.ingest.us.sentry.io/4510105426853888",
  
  // Add optional integrations for additional features
  integrations: [
    Sentry.replayIntegration({
      maskAllText: false,
      maskAllInputs: false,
    }),
  ],

  // Sample all traces
  tracesSampleRate: 1.0,
  
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Replay sampling
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 1.0,

  // Debug mode for testing
  debug: true,

  tracePropagationTargets: [
    'localhost',
    'localhost:4000',
    /^\/api\//,
    /^https?:\/\/localhost:\d+$/,
  ],
});

// Log client-side Sentry initialization
console.log('✅ [Sentry Client] Initialized');
console.log('   DSN:', Sentry.getClient()?.getDsn()?.toString());
console.log('   Metrics API available:', typeof Sentry.metrics !== 'undefined');
console.log('   Client exists:', !!Sentry.getClient());

// Test sending a metric immediately to verify it works
setTimeout(() => {
  console.log('[Sentry Client] Testing metrics by sending test.client.init...');
  try {
    Sentry.metrics.count('test.client.init', 1, {
      attributes: { test: 'initialization' }
    });
    console.log('[Sentry Client] ✅ Test metric sent');
  } catch (error) {
    console.error('[Sentry Client] ❌ Test metric failed:', error);
  }
}, 2000);

