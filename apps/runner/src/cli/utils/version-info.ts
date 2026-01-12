/**
 * Version and git commit info utilities
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find package root (apps/runner)
const packageRoot = join(__dirname, '..', '..', '..');

/**
 * Get the package version from package.json
 */
export function getPackageVersion(): string {
  try {
    const packageJsonPath = join(packageRoot, 'package.json');
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      return packageJson.version || '0.0.0';
    }
  } catch {
    // Ignore errors
  }
  return '0.0.0';
}

/**
 * Get the short git commit hash
 */
export function getGitCommit(): string | null {
  try {
    // Try to get commit from git command
    const commit = execSync('git rev-parse --short HEAD', {
      cwd: packageRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return commit || null;
  } catch {
    // Git not available or not a git repo
    return null;
  }
}

/**
 * Get combined version string with commit
 * Returns "v0.19.1 (abc1234)" or just "v0.19.1" if no commit
 */
export function getVersionString(): string {
  const version = getPackageVersion();
  const commit = getGitCommit();
  
  if (commit) {
    return `v${version} (${commit})`;
  }
  return `v${version}`;
}

/**
 * Version info object
 */
export interface VersionInfo {
  version: string;
  commit: string | null;
  display: string;
}

/**
 * Get all version info
 */
export function getVersionInfo(): VersionInfo {
  const version = getPackageVersion();
  const commit = getGitCommit();
  
  return {
    version,
    commit,
    display: commit ? `v${version} (${commit})` : `v${version}`,
  };
}
