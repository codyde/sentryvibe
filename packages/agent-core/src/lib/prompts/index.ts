/**
 * System Prompts - Main Export
 *
 * Feature flag: Set USE_LEGACY_PROMPTS=true to fall back to old prompts
 */
import {
  CLAUDE_SYSTEM_PROMPT as LEGACY_CLAUDE,
  CODEX_SYSTEM_PROMPT as LEGACY_CODEX,
} from '../prompts.legacy';
import { buildSystemPrompt } from './builder';

const USE_LEGACY = process.env.USE_LEGACY_PROMPTS === 'true';

export const CLAUDE_SYSTEM_PROMPT = USE_LEGACY
  ? LEGACY_CLAUDE
  : buildSystemPrompt('claude');

export const CODEX_SYSTEM_PROMPT = USE_LEGACY
  ? LEGACY_CODEX
  : buildSystemPrompt('codex');

// Re-export legacy prompts for any code that needs them directly
export { LEGACY_CLAUDE, LEGACY_CODEX };
