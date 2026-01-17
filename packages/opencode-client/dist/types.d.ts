/**
 * OpenCode Model Types
 *
 * Models are specified in provider/model format.
 * This allows using any provider supported by OpenCode.
 */
type OpenCodeProvider = 'anthropic' | 'openai' | 'google' | 'deepseek' | 'openrouter' | 'groq' | 'fireworks' | 'together' | 'opencode';
type AnthropicModelId = 'claude-sonnet-4-5' | 'claude-haiku-4-5' | 'claude-opus-4-5';
type OpenAIModelId = 'gpt-4o' | 'gpt-4o-mini' | 'o3' | 'o3-mini';
type GoogleModelId = 'gemini-2.5-pro' | 'gemini-2.5-flash';
type DeepSeekModelId = 'deepseek-chat' | 'deepseek-reasoner';
type OpenCodeModelId = `anthropic/${AnthropicModelId}` | `openai/${OpenAIModelId}` | `google/${GoogleModelId}` | `deepseek/${DeepSeekModelId}` | `opencode/${string}` | `openrouter/${string}` | string;
declare const DEFAULT_OPENCODE_MODEL_ID: OpenCodeModelId;
type AgentId = 'opencode' | 'openai-codex';
declare const DEFAULT_AGENT_ID: AgentId;
interface ModelMetadata {
    label: string;
    description: string;
    provider: OpenCodeProvider;
}
declare const MODEL_METADATA: Record<string, ModelMetadata>;
declare const LEGACY_MODEL_MAP: Record<string, OpenCodeModelId>;
/**
 * Convert legacy model ID to OpenCode format
 */
declare function normalizeModelId(modelId: string): OpenCodeModelId;
/**
 * Parse model ID into provider and model components
 */
declare function parseModelId(modelId: OpenCodeModelId): {
    provider: string;
    model: string;
};
/**
 * Get display label for a model
 */
declare function getModelLabel(modelId: OpenCodeModelId): string;

export { type AgentId, type AnthropicModelId, DEFAULT_AGENT_ID, DEFAULT_OPENCODE_MODEL_ID, type DeepSeekModelId, type GoogleModelId, LEGACY_MODEL_MAP, MODEL_METADATA, type ModelMetadata, type OpenAIModelId, type OpenCodeModelId, type OpenCodeProvider, getModelLabel, normalizeModelId, parseModelId };
