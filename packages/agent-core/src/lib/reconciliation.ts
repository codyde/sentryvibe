import { db } from './db/client';
import { projects } from './db/schema';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { getWorkspaceRoot } from './workspace';

export interface ReconciliationResult {
  inDbNotFs: Array<{
    id: string;
    name: string;
    slug: string;
    path: string;
  }>;
  inFsNotDb: Array<{
    name: string;
    path: string;
  }>;
  synced: Array<{
    id: string;
    name: string;
    slug: string;
    path: string;
  }>;
  summary: {
    total: number;
    synced: number;
    orphanedDb: number;
    untracked: number;
  };
}

export async function reconcileProjectsWithFilesystem(): Promise<ReconciliationResult> {
  const projectsDir = getWorkspaceRoot();

  // Get all projects from database
  const dbProjects = await db.select().from(projects);

  // Get all directories from filesystem
  let fsDirs: string[] = [];
  try {
    await stat(projectsDir);
    const entries = await readdir(projectsDir, { withFileTypes: true });
    fsDirs = entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => entry.name);
  } catch (error) {
    console.warn('Projects directory not found:', error);
  }

  const result: ReconciliationResult = {
    inDbNotFs: [],
    inFsNotDb: [],
    synced: [],
    summary: {
      total: 0,
      synced: 0,
      orphanedDb: 0,
      untracked: 0,
    },
  };

  // Check which DB projects exist on filesystem
  for (const project of dbProjects) {
    const dirName = project.slug;
    const exists = fsDirs.includes(dirName);

    if (exists) {
      result.synced.push({
        id: project.id,
        name: project.name,
        slug: project.slug,
        path: project.path,
      });
    } else {
      result.inDbNotFs.push({
        id: project.id,
        name: project.name,
        slug: project.slug,
        path: project.path,
      });
    }
  }

  // Check which filesystem directories are not in DB
  const dbSlugs = new Set(dbProjects.map(p => p.slug));
  for (const dirName of fsDirs) {
    if (!dbSlugs.has(dirName)) {
      result.inFsNotDb.push({
        name: dirName,
        path: join(projectsDir, dirName),
      });
    }
  }

  // Calculate summary
  result.summary.total = dbProjects.length + result.inFsNotDb.length;
  result.summary.synced = result.synced.length;
  result.summary.orphanedDb = result.inDbNotFs.length;
  result.summary.untracked = result.inFsNotDb.length;

  return result;
}
