export { DEFAULT_AGENT_ID, DEFAULT_OPENCODE_MODEL_ID, LEGACY_MODEL_MAP, MODEL_METADATA, getModelLabel, normalizeModelId, parseModelId } from './chunk-PHWSQCAI.js';
import { createOpencodeClient } from '@opencode-ai/sdk';

var cachedClient = null;
var cachedBaseUrl = null;
function getOpenCodeUrl() {
  const url = process.env.OPENCODE_URL;
  if (!url) {
    if (process.env.NODE_ENV === "development" || process.env.OPENBUILDER_LOCAL_MODE === "true") {
      return "http://localhost:4096";
    }
    throw new Error(
      "OPENCODE_URL environment variable is required. Set it to the URL of your OpenCode service (e.g., http://localhost:4096)"
    );
  }
  return url;
}
function getOpenCodeClient(options = {}) {
  const baseUrl = options.baseUrl || getOpenCodeUrl();
  if (cachedClient && cachedBaseUrl === baseUrl) {
    return cachedClient;
  }
  cachedClient = createOpencodeClient({
    baseUrl,
    fetch: options.fetch,
    throwOnError: options.throwOnError ?? false
  });
  cachedBaseUrl = baseUrl;
  return cachedClient;
}
function createOpenCodeClient(options = {}) {
  const baseUrl = options.baseUrl || getOpenCodeUrl();
  return createOpencodeClient({
    baseUrl,
    fetch: options.fetch,
    throwOnError: options.throwOnError ?? false
  });
}
async function checkOpenCodeHealth(options = {}) {
  try {
    const client = getOpenCodeClient(options);
    const result = await client.global.health();
    if (result.data) {
      return {
        healthy: result.data.healthy,
        version: result.data.version
      };
    }
    return {
      healthy: false,
      error: "No response from health check"
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
function clearClientCache() {
  cachedClient = null;
  cachedBaseUrl = null;
}

export { checkOpenCodeHealth, clearClientCache, createOpenCodeClient, getOpenCodeClient, getOpenCodeUrl };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map