/**
 * Background handler for PROJECT_ANALYZED events from runner
 * Updates projects in database when runner completes AI analysis
 */

import { addRunnerEventSubscriber } from '@sentryvibe/agent-core/lib/runner/event-stream';
import type { RunnerEvent } from '@/shared/runner/messages';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { projects } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';

let isInitialized = false;

/**
 * Initialize the global event handler for project analysis events
 * Call this once when the app starts
 */
export function initializeProjectAnalysisHandler() {
  if (isInitialized) {
    console.log('[project-analysis-handler] Already initialized');
    return;
  }

  console.log('[project-analysis-handler] Initializing...');

  addRunnerEventSubscriber(async (event: RunnerEvent) => {
    if (event.type === 'project-analyzed' && event.projectId) {
      try {
        console.log(`[project-analysis-handler] Received analysis for project ${event.projectId}`);

        const { template, metadata, reasoning } = event.payload;

        // Update project with real metadata from runner
        await db.update(projects).set({
          name: metadata.friendlyName,
          slug: metadata.slug,
          description: metadata.description,
          icon: metadata.icon,
          status: 'pending', // Ready for build
          projectType: template.framework,
          runCommand: template.runCommand,
          port: template.port,
        }).where(eq(projects.id, event.projectId));

        console.log(`✅ [project-analysis-handler] Updated project: ${metadata.friendlyName} (${metadata.slug})`);
        console.log(`   Template: ${template.name}`);
        console.log(`   Reasoning: ${reasoning.substring(0, 100)}...`);
      } catch (error) {
        console.error(`❌ [project-analysis-handler] Failed to update project ${event.projectId}:`, error);

        // Mark project as failed
        try {
          await db.update(projects).set({
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Failed to process analysis',
          }).where(eq(projects.id, event.projectId));
        } catch (dbError) {
          console.error('[project-analysis-handler] Failed to mark project as failed:', dbError);
        }
      }
    }
  });

  isInitialized = true;
  console.log('[project-analysis-handler] ✅ Initialized');
}
