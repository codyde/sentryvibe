/**
 * Model Tag Parser
 *
 * Parses model tags to extract agent and model information.
 * Format: <agent>-<model>
 * Examples:
 * - "claude-sonnet-4.5" → agent: "claude-code", model: "claude-sonnet-4.5"
 * - "claude-opus-4" → agent: "claude-code", model: "claude-opus-4"
 * - "claude-haiku-4.5" → agent: "claude-code", model: "claude-haiku-4.5"
 * - "openai-gpt-5-codex" → agent: "openai-codex", model: "gpt-5-codex"
 */

import type { AgentId } from '../../types/agent';
import type { ClaudeModelId } from '../../shared/runner/messages';

export interface ParsedModel {
  agent: AgentId;
  claudeModel?: ClaudeModelId;
}

/**
 * Parse a model tag value into agent and model components
 */
export function parseModelTag(modelTag: string): ParsedModel {
  // OpenAI models
  if (modelTag.startsWith('openai-')) {
    return {
      agent: 'openai-codex' as AgentId,
      claudeModel: undefined
    };
  }

  // Claude models (default)
  // Format: claude-<model>-<version>
  return {
    agent: 'claude-code' as AgentId,
    claudeModel: modelTag as ClaudeModelId
  };
}
