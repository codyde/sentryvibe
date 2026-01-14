/**
 * Schema barrel file - exports the appropriate schema based on MODE
 * 
 * MODE=LOCAL  -> SQLite schema (simplified, no auth tables)
 * MODE=HOSTED -> PostgreSQL schema (full schema with auth)
 * 
 * Default: LOCAL (for easiest onboarding)
 */

import { isLocalMode } from './mode.js';

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

// Import both schemas statically - the bundler will include both
// At runtime, we select which one to use based on MODE
import * as sqliteSchema from './schema.sqlite.js';
import * as pgSchema from './schema.pg.js';

// Select the schema based on mode at module load time
const schema = isLocalMode() ? sqliteSchema : pgSchema;

// Export all tables from the selected schema
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
