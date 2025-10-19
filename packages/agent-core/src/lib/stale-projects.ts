import { db } from './db/client';
import { projects } from './db/schema';
import { eq } from 'drizzle-orm';
import { projectCache } from './cache/project-cache';

const STALE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export interface StaleProject {
  id: string;
  name: string;
  slug: string;
  status: string;
  lastActivityAt: Date | null;
  minutesStale: number;
}

export async function findStaleProjects(): Promise<StaleProject[]> {
  const allProjects = await db.select().from(projects).where(eq(projects.status, 'in_progress'));

  const now = new Date();
  const staleProjects: StaleProject[] = [];

  for (const project of allProjects) {
    if (!project.lastActivityAt) continue;

    const lastActivity = new Date(project.lastActivityAt);
    const timeDiff = now.getTime() - lastActivity.getTime();

    if (timeDiff > STALE_TIMEOUT_MS) {
      staleProjects.push({
        id: project.id,
        name: project.name,
        slug: project.slug,
        status: project.status,
        lastActivityAt: project.lastActivityAt,
        minutesStale: Math.floor(timeDiff / 60000),
      });
    }
  }

  return staleProjects;
}

export async function markStaleProjectsAsFailed(): Promise<number> {
  const staleProjects = await findStaleProjects();

  let count = 0;
  for (const stale of staleProjects) {
    await db.update(projects)
      .set({
        status: 'failed',
        errorMessage: `Generation timed out after ${stale.minutesStale} minutes of inactivity`,
        devServerStatus: 'stopped',
        devServerPid: null,
        devServerPort: null,
      })
      .where(eq(projects.id, stale.id));

    // Invalidate cache since project status changed
    projectCache.invalidate(stale.id);

    console.log(`⏰ Marked stale project as failed: ${stale.name} (${stale.minutesStale}m idle)`);
    count++;
  }

  return count;
}
