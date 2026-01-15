/**
 * NeonDB Integration Types
 * 
 * Types for managing NeonDB PostgreSQL database connections for projects.
 * Uses npx neondb -y for instant database provisioning.
 */

/**
 * NeonDB connection status for a project
 */
export interface NeonDBStatus {
  /** Whether NeonDB is connected */
  isConnected: boolean;
  /** Database host endpoint */
  host: string | null;
  /** Database name */
  database: string | null;
  /** Claim URL to save database to Neon account */
  claimUrl: string | null;
  /** When database was provisioned */
  createdAt: Date | null;
  /** When unclaimed database expires (72 hours from creation) */
  expiresAt: Date | null;
  /** Whether database is claimed (won't expire) */
  isClaimed: boolean;
}

/**
 * Response from NeonDB setup via skill
 */
export interface NeonDBSetupResult {
  /** Whether setup was successful */
  success: boolean;
  /** Action performed */
  action: 'setup' | 'error';
  /** Error message if failed */
  error?: string;
}

/**
 * Chat message types for NeonDB operations
 */
export const NEONDB_CHAT_MESSAGES = {
  SETUP: 'Configure a NeonDB PostgreSQL database for this project.',
} as const;

export type NeonDBChatMessageType = keyof typeof NEONDB_CHAT_MESSAGES;
