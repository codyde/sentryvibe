/**
 * Auto-update utility for SentryVibe CLI
 * 
 * Checks GitHub Releases for newer versions and automatically
 * updates both:
 * 1. The CLI itself (globally installed npm package)
 * 2. The app/monorepo (local installation that runs the web app)
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import pc from 'picocolors';
import { configManager } from './config-manager.js';

// GitHub API endpoint for releases
const GITHUB_RELEASES_URL = 'https://api.github.com/repos/codyde/sentryvibe/releases/latest';

// Install command for CLI
const INSTALL_COMMAND = 'curl -fsSL https://sentryvibe.app/install | bash';

// Cache settings
const CACHE_DIR = join(homedir(), '.config', 'sentryvibe');
const CACHE_FILE = join(CACHE_DIR, 'update-cache.json');
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface UpdateCache {
  lastCheck: number;
  latestVersion: string;
  // Track if we need to upgrade the app after CLI update
  pendingAppUpgrade?: boolean;
}

/**
 * Read the update cache file
 */
function readUpdateCache(): UpdateCache | null {
  try {
    if (existsSync(CACHE_FILE)) {
      const content = readFileSync(CACHE_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    // Cache read failed, that's fine
  }
  return null;
}

/**
 * Write to the update cache file
 */
function saveUpdateCache(cache: UpdateCache): void {
  try {
    if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true });
    }
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {
    // Cache write failed, that's fine
  }
}

/**
 * Fetch the latest release version from GitHub
 * Returns version string (e.g., "0.28.0") or null on failure
 */
async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(GITHUB_RELEASES_URL, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'SentryVibe-CLI-AutoUpdate',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { tag_name: string };
    // Remove 'v' prefix if present (e.g., "v0.28.0" -> "0.28.0")
    return data.tag_name.replace(/^v/, '');
  } catch {
    // Network error, timeout, or parse error
    return null;
  }
}

/**
 * Compare two semver versions
 * Returns true if version1 < version2 (i.e., version2 is newer)
 */
function isNewerVersion(current: string, latest: string): boolean {
  const parseVersion = (v: string) => {
    const parts = v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
  };

  const c = parseVersion(current);
  const l = parseVersion(latest);

  if (l.major > c.major) return true;
  if (l.major < c.major) return false;
  if (l.minor > c.minor) return true;
  if (l.minor < c.minor) return false;
  return l.patch > c.patch;
}

/**
 * Perform the CLI update by running the install script
 */
function performCLIUpdate(): boolean {
  try {
    // Run the install command
    execSync(INSTALL_COMMAND, {
      stdio: 'inherit',
      shell: '/bin/bash',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the app/monorepo needs upgrading and perform the upgrade
 * This updates the local SentryVibe installation that runs the web app
 */
function performAppUpgrade(): boolean {
  const config = configManager.get();
  const monorepoPath = config.monorepoPath;

  // No monorepo configured, skip app upgrade
  if (!monorepoPath || !existsSync(monorepoPath)) {
    return true; // Not an error, just nothing to upgrade
  }

  console.log();
  console.log(`  ${pc.cyan('⬆')} ${pc.bold('Upgrading app installation...')}`);
  console.log(`  ${pc.dim(monorepoPath)}`);
  console.log();

  try {
    // Run sentryvibe upgrade --force to upgrade the monorepo
    // Use --force to skip prompts since we're in auto-update mode
    const result = spawnSync('sentryvibe', ['upgrade', '--force'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        SENTRYVIBE_SKIP_UPDATE_CHECK: '1', // Don't re-check for CLI updates
      },
      shell: true,
    });

    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Re-launch the CLI with original arguments after update
 */
function relaunchCLI(): void {
  const args = process.argv.slice(2);
  
  try {
    // Use spawnSync with inherit to seamlessly continue
    const result = spawnSync('sentryvibe', args, {
      stdio: 'inherit',
      env: { 
        ...process.env, 
        SENTRYVIBE_SKIP_UPDATE_CHECK: '1' // Prevent update loop
      },
      shell: true,
    });
    
    // Exit with the same code as the relaunched process
    process.exit(result.status ?? 0);
  } catch {
    // If relaunch fails, just exit - user can run command again
    process.exit(0);
  }
}

/**
 * Main auto-update check function
 * Call this early in CLI startup
 * 
 * Updates both:
 * 1. The CLI itself (globally installed)
 * 2. The app/monorepo (if configured)
 * 
 * @param currentVersion - Current CLI version from package.json
 * @returns true if update was performed and CLI should exit
 */
export async function checkAndAutoUpdate(currentVersion: string): Promise<boolean> {
  // Skip if update check is disabled via env var
  if (process.env.SENTRYVIBE_NO_UPDATE === '1' || process.env.SENTRYVIBE_SKIP_UPDATE_CHECK === '1') {
    // But check if we have a pending app upgrade from a previous CLI update
    const cache = readUpdateCache();
    if (cache?.pendingAppUpgrade) {
      console.log();
      console.log(`  ${pc.cyan('⬆')} ${pc.bold('Completing app upgrade...')}`);
      
      const appSuccess = performAppUpgrade();
      
      if (appSuccess) {
        // Clear the pending flag
        saveUpdateCache({ ...cache, pendingAppUpgrade: false });
        console.log(`  ${pc.green('✓')} ${pc.bold('App upgrade complete!')}`);
      } else {
        console.log(`  ${pc.yellow('⚠')} ${pc.dim('App upgrade failed. Run manually:')} ${pc.cyan('sentryvibe upgrade')}`);
      }
      console.log();
    }
    return false;
  }

  // Skip if disabled in config
  const config = configManager.get();
  if (config.autoUpdate === false) {
    return false;
  }

  let latestVersion: string | null = null;

  // Check cache first to avoid hitting GitHub API too often
  const cache = readUpdateCache();
  const now = Date.now();

  if (cache && (now - cache.lastCheck) < CACHE_TTL_MS) {
    // Use cached version
    latestVersion = cache.latestVersion;
  } else {
    // Fetch from GitHub (with timeout)
    latestVersion = await fetchLatestVersion();
    
    if (latestVersion) {
      // Update cache
      saveUpdateCache({
        lastCheck: now,
        latestVersion,
      });
    } else if (cache) {
      // Fetch failed, use stale cache
      latestVersion = cache.latestVersion;
    }
  }

  // If we couldn't determine latest version, skip update
  if (!latestVersion) {
    return false;
  }

  // Check if update is needed
  if (!isNewerVersion(currentVersion, latestVersion)) {
    return false;
  }

  // Update available! Show message and perform update
  console.log();
  console.log(`  ${pc.cyan('⬆')} ${pc.bold('Update available:')} ${pc.dim(currentVersion)} → ${pc.green(latestVersion)}`);
  console.log();

  // Step 1: Update the CLI
  console.log(`  ${pc.dim('Step 1/2:')} Updating CLI...`);
  const cliSuccess = performCLIUpdate();

  if (!cliSuccess) {
    // CLI update failed, continue with current version
    console.log();
    console.log(`  ${pc.yellow('⚠')} ${pc.dim('CLI update failed. Continuing with current version.')}`);
    console.log(`  ${pc.dim('You can manually update with:')} ${pc.cyan('curl -fsSL https://sentryvibe.app/install | bash')}`);
    console.log();
    return false;
  }

  console.log(`  ${pc.green('✓')} CLI updated to ${pc.green(latestVersion)}`);
  
  // Step 2: Check if we need to upgrade the app
  const monorepoPath = config.monorepoPath;
  const hasMonorepo = monorepoPath && existsSync(monorepoPath);

  if (hasMonorepo) {
    // Mark that we need to upgrade the app after CLI restart
    // The new CLI version will handle the app upgrade
    saveUpdateCache({
      lastCheck: now,
      latestVersion,
      pendingAppUpgrade: true,
    });
    
    console.log();
    console.log(`  ${pc.dim('Step 2/2:')} App upgrade will continue after restart...`);
  }

  console.log();
  console.log(`  ${pc.green('✓')} ${pc.bold('CLI update complete!')} Restarting...`);
  console.log();
  
  // Relaunch CLI with original args
  // The new CLI will pick up the pendingAppUpgrade flag and complete step 2
  relaunchCLI();
  
  return true; // CLI will exit via relaunchCLI
}

/**
 * Check for updates without auto-updating (for TUI modes)
 * Returns version info that can be displayed in the TUI
 * 
 * @param currentVersion - Current CLI version from package.json
 * @returns Update info or null if no update available
 */
export async function checkForUpdate(currentVersion: string): Promise<{
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
} | null> {
  // Skip if update check is disabled via env var
  if (process.env.SENTRYVIBE_NO_UPDATE === '1' || process.env.SENTRYVIBE_SKIP_UPDATE_CHECK === '1') {
    return null;
  }

  // Skip if disabled in config
  const config = configManager.get();
  if (config.autoUpdate === false) {
    return null;
  }

  let latestVersion: string | null = null;

  // Check cache first to avoid hitting GitHub API too often
  const cache = readUpdateCache();
  const now = Date.now();

  if (cache && (now - cache.lastCheck) < CACHE_TTL_MS) {
    // Use cached version
    latestVersion = cache.latestVersion;
  } else {
    // Fetch from GitHub (with timeout)
    latestVersion = await fetchLatestVersion();
    
    if (latestVersion) {
      // Update cache
      saveUpdateCache({
        lastCheck: now,
        latestVersion,
        pendingAppUpgrade: cache?.pendingAppUpgrade,
      });
    } else if (cache) {
      // Fetch failed, use stale cache
      latestVersion = cache.latestVersion;
    }
  }

  // If we couldn't determine latest version, return null
  if (!latestVersion) {
    return null;
  }

  const updateAvailable = isNewerVersion(currentVersion, latestVersion);
  
  return {
    currentVersion,
    latestVersion,
    updateAvailable,
  };
}

/**
 * Clear the update cache (useful for testing or forcing a fresh check)
 */
export function clearUpdateCache(): void {
  try {
    if (existsSync(CACHE_FILE)) {
      unlinkSync(CACHE_FILE);
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Get the current update status (for debugging/status commands)
 */
export function getUpdateStatus(): { 
  cacheFile: string;
  cache: UpdateCache | null;
  monorepoPath: string | undefined;
  hasMonorepo: boolean;
} {
  const config = configManager.get();
  const monorepoPath = config.monorepoPath;
  
  return {
    cacheFile: CACHE_FILE,
    cache: readUpdateCache(),
    monorepoPath,
    hasMonorepo: !!(monorepoPath && existsSync(monorepoPath)),
  };
}
