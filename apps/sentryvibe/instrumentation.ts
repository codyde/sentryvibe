// This file is used for Next.js instrumentation
// It runs once when the server starts
import { cleanupOrphanedProcesses } from './src/lib/startup-cleanup';
import * as fs from 'fs';
import * as path from 'path';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Ensure webpack cache directory exists to prevent ENOENT errors
    const cacheDir = path.join(process.cwd(), '.next', 'cache', 'webpack');
    try {
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
        console.log('Created webpack cache directory:', cacheDir);
      }
    } catch (error) {
      console.warn('Failed to create webpack cache directory:', error);
    }

    // Run cleanup on server startup
    await cleanupOrphanedProcesses();
  }
}
