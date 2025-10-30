/**
 * Model Tag Resolver
 *
 * Resolves model tags to provider and model using explicit mapping.
 * No parsing - just direct lookup from tag configuration.
 */

import type { AgentId } from '../../types/agent';
import type { ClaudeModelId } from '../../shared/runner/messages';
import { findTagDefinition } from '../../config/tags';

export interface ParsedModel {
  agent: AgentId;
  claudeModel?: ClaudeModelId;
}

/**
 * Resolve a model tag value to agent and model using config mapping
 */
export function parseModelTag(modelTagValue: string): ParsedModel {
  const modelDef = findTagDefinition('model');
  const modelOption = modelDef?.options?.find(o => o.value === modelTagValue);

  if (!modelOption) {
    // Fallback to default
    return {
      agent: 'claude-code' as AgentId,
      claudeModel: 'claude-haiku-4-5' as ClaudeModelId
    };
  }

  // Use explicit mapping from config
  return {
    agent: (modelOption.provider || 'claude-code') as AgentId,
    claudeModel: modelOption.model as ClaudeModelId | undefined
  };
}
