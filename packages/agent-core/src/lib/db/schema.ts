/**
 * Schema barrel file - exports the appropriate schema based on MODE
 * 
 * MODE=LOCAL  -> SQLite schema (simplified, no auth tables)
 * MODE=HOSTED -> PostgreSQL schema (full schema with auth)
 * 
 * Default: LOCAL (for easiest onboarding)
 */

import { isLocalMode } from './mode.js';

// Re-export everything from the appropriate schema
// Note: We use dynamic imports at build time, but for type safety
// we need to export a consistent interface

// For type compatibility, we always export from the full PG schema types
// The actual runtime behavior uses the correct schema
export type {
  // Auth types (stubs in SQLite mode)
  User,
  NewUser,
  Session,
  NewSession,
  Account,
  NewAccount,
  Verification,
  NewVerification,
  RunnerKey,
  NewRunnerKey,
  // Application types
  Project,
  NewProject,
  Message,
  NewMessage,
  PortAllocation,
  ServerOperation,
  NewServerOperation,
  GenerationSession,
  GenerationTodo,
  GenerationToolCall,
  GenerationNote,
} from './schema.pg.js';

// Conditional exports based on mode
// We use a function to lazily load the correct schema
function getSchema() {
  if (isLocalMode()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./schema.sqlite.js');
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./schema.pg.js');
  }
}

// Get the schema once at module load time
const schema = getSchema();

// Export all tables
export const users = schema.users;
export const sessions = schema.sessions;
export const accounts = schema.accounts;
export const verifications = schema.verifications;
export const runnerKeys = schema.runnerKeys;
export const projects = schema.projects;
export const messages = schema.messages;
export const portAllocations = schema.portAllocations;
export const runningProcesses = schema.runningProcesses;
export const generationSessions = schema.generationSessions;
export const generationTodos = schema.generationTodos;
export const generationToolCalls = schema.generationToolCalls;
export const generationNotes = schema.generationNotes;
export const serverOperations = schema.serverOperations;
