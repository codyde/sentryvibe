import * as Sentry from '@sentry/nextjs';

export async function register() {
  // Disable AI SDK warnings globally
  process.env.AI_SDK_LOG_WARNINGS = 'false';

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
