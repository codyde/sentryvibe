import { db } from './db/client';
import { projects } from './db/schema';
import { eq, or } from 'drizzle-orm';

export async function cleanupOrphanedProcesses() {
  console.log('🧹 Cleaning up orphaned dev server processes...');

  try {
    // Find all projects with running or starting dev servers
    const runningProjects = await db.select()
      .from(projects)
      .where(
        or(
          eq(projects.devServerStatus, 'running'),
          eq(projects.devServerStatus, 'starting')
        )
      );

    let cleanedCount = 0;

    for (const project of runningProjects) {
      if (project.devServerPid) {
        try {
          // Try to kill the process
          process.kill(project.devServerPid, 'SIGTERM');

          // Force kill after 2 seconds
          setTimeout(() => {
            try {
              if (project.devServerPid) {
                process.kill(project.devServerPid, 'SIGKILL');
              }
            } catch {}
          }, 2000);

          console.log(`  Killed orphaned process ${project.devServerPid} for project: ${project.name}`);
          cleanedCount++;
        } catch (error) {
          // Process might not exist anymore, that's fine
          console.log(`  Process ${project.devServerPid} already dead for project: ${project.name}`);
        }
      }

      // Reset DB status
      await db.update(projects)
        .set({
          devServerPid: null,
          devServerPort: null,
          devServerStatus: 'stopped',
        })
        .where(eq(projects.id, project.id));
    }

    console.log(`✅ Cleanup complete. Terminated ${cleanedCount} orphaned processes.`);
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
}
