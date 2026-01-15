// src/types.ts
var DEFAULT_OPENCODE_MODEL_ID = "anthropic/claude-sonnet-4-5";
var DEFAULT_AGENT_ID = "opencode";
var MODEL_METADATA = {
  "anthropic/claude-sonnet-4-5": {
    label: "Claude Sonnet 4.5",
    provider: "anthropic",
    description: "Balanced performance and quality"
  },
  "anthropic/claude-haiku-4-5": {
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    description: "Fast and efficient"
  },
  "anthropic/claude-opus-4-5": {
    label: "Claude Opus 4.5",
    provider: "anthropic",
    description: "Most capable for complex tasks"
  },
  "openai/gpt-4o": {
    label: "GPT-4o",
    provider: "openai",
    description: "OpenAI flagship model"
  },
  "openai/o3": {
    label: "o3",
    provider: "openai",
    description: "OpenAI reasoning model"
  },
  "google/gemini-2.5-pro": {
    label: "Gemini 2.5 Pro",
    provider: "google",
    description: "Google flagship model"
  },
  "deepseek/deepseek-chat": {
    label: "DeepSeek Chat",
    provider: "deepseek",
    description: "DeepSeek conversational model"
  },
  "deepseek/deepseek-reasoner": {
    label: "DeepSeek Reasoner",
    provider: "deepseek",
    description: "DeepSeek reasoning model"
  }
};
var LEGACY_MODEL_MAP = {
  "claude-haiku-4-5": "anthropic/claude-haiku-4-5",
  "claude-sonnet-4-5": "anthropic/claude-sonnet-4-5",
  "claude-opus-4-5": "anthropic/claude-opus-4-5"
};
function normalizeModelId(modelId) {
  if (modelId.includes("/")) {
    return modelId;
  }
  return LEGACY_MODEL_MAP[modelId] || `anthropic/${modelId}`;
}
function parseModelId(modelId) {
  const normalized = normalizeModelId(modelId);
  const [provider, ...modelParts] = normalized.split("/");
  return {
    provider: provider || "anthropic",
    model: modelParts.join("/") || "claude-sonnet-4-5"
  };
}
function getModelLabel(modelId) {
  const normalized = normalizeModelId(modelId);
  return MODEL_METADATA[normalized]?.label ?? modelId;
}

export { DEFAULT_AGENT_ID, DEFAULT_OPENCODE_MODEL_ID, LEGACY_MODEL_MAP, MODEL_METADATA, getModelLabel, normalizeModelId, parseModelId };
//# sourceMappingURL=chunk-PHWSQCAI.js.map
//# sourceMappingURL=chunk-PHWSQCAI.js.map