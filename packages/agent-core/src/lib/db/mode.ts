/**
 * Database mode detection
 * 
 * MODE=LOCAL  -> SQLite, no auth, single-user
 * MODE=HOSTED -> PostgreSQL, full auth, multi-tenant
 * 
 * Default: LOCAL for easiest local development
 */

export type DatabaseMode = 'LOCAL' | 'HOSTED';

/**
 * Get the current database mode
 */
export function getDatabaseMode(): DatabaseMode {
  const mode = process.env.MODE?.toUpperCase();
  if (mode === 'HOSTED') {
    return 'HOSTED';
  }
  // Default to LOCAL for easiest onboarding
  return 'LOCAL';
}

/**
 * Check if running in local mode (SQLite, no auth)
 */
export function isLocalMode(): boolean {
  return getDatabaseMode() === 'LOCAL';
}

/**
 * Check if running in hosted mode (PostgreSQL, with auth)
 */
export function isHostedMode(): boolean {
  return getDatabaseMode() === 'HOSTED';
}

/**
 * Get the SQLite database path for local mode
 * Default: ~/.sentryvibe/data.db
 */
export function getSqlitePath(): string {
  if (process.env.DATABASE_PATH) {
    return process.env.DATABASE_PATH;
  }
  
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
  return `${homeDir}/.sentryvibe/data.db`;
}
