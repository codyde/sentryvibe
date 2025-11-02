/**
 * Simplified Message Structure
 *
 * Each interaction (user input, assistant response, tool call, system message)
 * is its own message in a flat array. This matches the database schema perfectly
 * and makes TanStack DB queries much simpler.
 *
 * Benefits:
 * - Matches PostgreSQL schema (id, project_id, role, content)
 * - No complex parts array to parse
 * - Easy to append new messages
 * - Simple to query and filter
 * - Better for TanStack DB differential dataflow
 */
export interface Message {
  id: string;
  projectId: string;
  type: 'user' | 'assistant' | 'system' | 'tool-call' | 'tool-result';
  content: string;
  timestamp: number;
  metadata?: {
    toolName?: string;
    toolCallId?: string;
    input?: unknown;
    output?: unknown;
    [key: string]: unknown;
  };
}

/**
 * Legacy types - keeping for backward compatibility during migration
 * Can be removed after full migration
 */
export interface MessagePart {
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  state?: string;
}

export interface ElementChange {
  id: string;
  elementSelector: string;
  changeRequest: string;
  elementInfo?: Record<string, unknown>;
  status: 'processing' | 'completed' | 'failed';
  toolCalls: Array<{
    name: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    status: 'running' | 'completed' | 'failed';
  }>;
  error?: string;
}
