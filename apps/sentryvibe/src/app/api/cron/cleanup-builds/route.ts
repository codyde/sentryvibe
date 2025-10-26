import { NextResponse } from 'next/server';
import { cleanupStuckBuilds } from '@sentryvibe/agent-core/lib/runner/persistent-event-processor';

/**
 * Cron endpoint to clean up stuck builds
 * This should be called periodically (e.g., every 10-15 minutes) to:
 * - Finalize builds that completed but session wasn't updated
 * - Clean up old subscriber registrations
 * - Fix inconsistent database states
 *
 * Can be triggered by:
 * - Vercel Cron Jobs (vercel.json)
 * - External cron service (cron-job.org, etc.)
 * - Manual trigger for testing
 *
 * Example vercel.json config:
 * {
 *   "crons": [{
 *     "path": "/api/cron/cleanup-builds",
 *     "schedule": "0,15,30,45 * * * *"
 *   }]
 * }
 */
export async function GET(req: Request) {
  try {
    // Verify this is a legitimate cron request
    // Option 1: Check for Vercel cron secret
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.warn('[cleanup-cron] Unauthorized request to cron endpoint');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[cleanup-cron] 🧹 Starting build cleanup job');

    // Clean up builds older than 30 minutes
    await cleanupStuckBuilds(30);

    console.log('[cleanup-cron] ✅ Build cleanup completed successfully');

    return NextResponse.json({
      success: true,
      message: 'Build cleanup completed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[cleanup-cron] ❌ Build cleanup failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Build cleanup failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint for manual trigger with custom parameters
 */
export async function POST(req: Request) {
  try {
    // Verify authorization
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.warn('[cleanup-cron] Unauthorized POST request to cron endpoint');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const maxAgeMinutes = typeof body.maxAgeMinutes === 'number' ? body.maxAgeMinutes : 30;

    console.log(`[cleanup-cron] 🧹 Starting manual build cleanup (maxAge: ${maxAgeMinutes} minutes)`);

    await cleanupStuckBuilds(maxAgeMinutes);

    console.log('[cleanup-cron] ✅ Manual build cleanup completed successfully');

    return NextResponse.json({
      success: true,
      message: `Build cleanup completed with maxAge=${maxAgeMinutes} minutes`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[cleanup-cron] ❌ Manual build cleanup failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Build cleanup failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
