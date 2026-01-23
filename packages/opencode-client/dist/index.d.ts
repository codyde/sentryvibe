import { createOpencodeClient } from '@opencode-ai/sdk';
export { AgentId, AnthropicModelId, DEFAULT_AGENT_ID, DEFAULT_OPENCODE_MODEL_ID, DeepSeekModelId, GoogleModelId, LEGACY_MODEL_MAP, MODEL_METADATA, ModelMetadata, OpenAIModelId, OpenCodeModelId, OpenCodeProvider, getModelLabel, normalizeModelId, parseModelId } from './types.js';

/**
 * OpenCode Client Package
 *
 * Provides a shared OpenCode SDK client for use across the monorepo.
 * Both the frontend (Next.js) and runner can use this to communicate
 * with the OpenCode service.
 */

type OpenCodeClient = ReturnType<typeof createOpencodeClient>;
/**
 * Configuration options for the OpenCode client
 */
interface OpenCodeClientOptions {
    /** Base URL of the OpenCode service. Defaults to OPENCODE_URL env var. */
    baseUrl?: string;
    /** Custom fetch implementation */
    fetch?: typeof fetch;
    /** Throw errors instead of returning them */
    throwOnError?: boolean;
}
/**
 * Get the OpenCode service URL from environment
 */
declare function getOpenCodeUrl(): string;
/**
 * Create or get a cached OpenCode client
 *
 * The client is cached per base URL to avoid creating multiple instances.
 *
 * @example
 * ```typescript
 * import { getOpenCodeClient } from '@openbuilder/opencode-client';
 *
 * const client = getOpenCodeClient();
 * const session = await client.session.create({ body: {} });
 * ```
 */
declare function getOpenCodeClient(options?: OpenCodeClientOptions): OpenCodeClient;
/**
 * Create a fresh OpenCode client (not cached)
 *
 * Use this when you need a client with different options or
 * want to ensure a fresh connection.
 */
declare function createOpenCodeClient(options?: OpenCodeClientOptions): OpenCodeClient;
/**
 * Check if the OpenCode service is healthy
 */
declare function checkOpenCodeHealth(options?: OpenCodeClientOptions): Promise<{
    healthy: boolean;
    version?: string;
    error?: string;
}>;
/**
 * Clear the cached client (useful for testing or reconnection)
 */
declare function clearClientCache(): void;

export { type OpenCodeClientOptions, checkOpenCodeHealth, clearClientCache, createOpenCodeClient, getOpenCodeClient, getOpenCodeUrl };
