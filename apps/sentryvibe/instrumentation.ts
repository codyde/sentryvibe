// This file is used for Next.js instrumentation
// It runs once when the server starts
import { cleanupOrphanedProcesses } from './src/lib/startup-cleanup';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Run cleanup on server startup
    await cleanupOrphanedProcesses();
  }
}
