import type { GenerationState } from './generation';

/**
 * Message part types for different content in chat messages
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

/**
 * Element change tracking for UI modification requests
 */
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

/**
 * Chat message interface
 * Used in TanStack DB messageCollection
 */
export interface Message {
  id: string;
  projectId: string; // Added for collection filtering
  role: 'user' | 'assistant';
  parts: MessagePart[];
  timestamp: number; // Added for ordering
  generationState?: GenerationState;
  elementChange?: ElementChange;
}
