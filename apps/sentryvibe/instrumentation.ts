// This file is used for Next.js instrumentation
// It runs once when the server starts
import * as Sentry from '@sentry/nextjs';
import { cleanupOrphanedProcesses } from './src/lib/startup-cleanup';

export async function register() {
  // Disable AI SDK warnings globally
  process.env.AI_SDK_LOG_WARNINGS = 'false';

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
    
    // Run cleanup on server startup
    await cleanupOrphanedProcesses();
    
    // Clean up abandoned port allocations on server startup
    try {
      const { cleanupAbandonedPorts } = await import('@sentryvibe/agent-core/lib/port-allocator');
      await cleanupAbandonedPorts();
      console.log('[instrumentation] ✅ Cleaned up abandoned port allocations');
    } catch (error) {
      console.error('[instrumentation] Failed to cleanup abandoned ports:', error);
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
