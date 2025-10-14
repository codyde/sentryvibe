import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * Check if current directory or a given path contains the SentryVibe monorepo
 */
export async function isSentryVibeRepo(path: string = process.cwd()): Promise<boolean> {
  try {
    // Check for key indicators
    const packageJsonPath = join(path, 'package.json');
    const runnerPath = join(path, 'apps/runner');
    const brokerPath = join(path, 'apps/broker');
    const sentryVibePath = join(path, 'apps/sentryvibe');

    // Must have package.json
    if (!existsSync(packageJsonPath)) {
      return false;
    }

    // Must have the three app directories
    if (!existsSync(runnerPath) || !existsSync(brokerPath) || !existsSync(sentryVibePath)) {
      return false;
    }

    // Verify package.json has correct name
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
    if (packageJson.name !== 'sentryvibe-monorepo') {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Find the SentryVibe monorepo root from current location
 * Searches up the directory tree
 */
export async function findMonorepoRoot(startPath: string = process.cwd()): Promise<string | null> {
  let currentPath = startPath;
  const root = '/';

  while (currentPath !== root) {
    if (await isSentryVibeRepo(currentPath)) {
      return currentPath;
    }

    // Move up one directory
    const parentPath = join(currentPath, '..');
    if (parentPath === currentPath) {
      break; // Reached root
    }
    currentPath = parentPath;
  }

  return null;
}

/**
 * Check if we're inside the monorepo (current dir or any parent)
 */
export async function isInsideMonorepo(): Promise<{ inside: boolean; root?: string }> {
  const root = await findMonorepoRoot();
  return {
    inside: root !== null,
    root: root || undefined,
  };
}
