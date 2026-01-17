/**
 * Claude Agent SDK Client Wrapper
 * 
 * Provides simple utilities for making Claude API calls using the Claude Agent SDK.
 * This uses the same authentication as the Claude CLI (no API key needed).
 */

import { query, type Options, type SDKMessage, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import * as os from 'os';
import * as path from 'path';
import { existsSync, mkdirSync } from 'fs';

/**
 * Get a clean env object with only string values (filter out undefined)
 * and ensure PATH is included
 */
function getCleanEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  // Ensure PATH is set - use common paths as fallback
  if (!env.PATH) {
    env.PATH = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
  }
  return env;
}

/**
 * Ensure a directory exists
 */
function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// Map our model IDs to Claude Agent SDK model names
const MODEL_MAP: Record<string, string> = {
  'claude-haiku-4-5': 'claude-sonnet-4-5', // Haiku 4.5 not yet available, use Sonnet
  'claude-sonnet-4-5': 'claude-sonnet-4-5',
  'claude-opus-4-5': 'claude-opus-4-5',
};

function resolveModelName(modelId: string): string {
  return MODEL_MAP[modelId] || 'claude-sonnet-4-5';
}

interface GenerateObjectOptions<T extends z.ZodType> {
  model: string;
  schema: T;
  prompt: string;
  system?: string;
}

/**
 * Generate a structured object using the Claude Agent SDK.
 * This uses the same authentication as the Claude CLI.
 */
export async function generateStructuredOutput<T extends z.ZodType>(
  options: GenerateObjectOptions<T>
): Promise<{ object: z.infer<T> }> {
  const modelName = resolveModelName(options.model);
  
  // Use Zod 4's built-in JSON Schema conversion
  const jsonSchema = z.toJSONSchema(options.schema);
  
  // Build the prompt that instructs Claude to output valid JSON
  const jsonInstructions = `You must respond with ONLY valid JSON that matches this schema. Do not include any text before or after the JSON object. Do not wrap in markdown code blocks.

JSON Schema:
${JSON.stringify(jsonSchema, null, 2)}

CRITICAL: Your response must START with { and END with }. Output only the JSON object.`;

  const fullPrompt = options.system 
    ? `${options.system}\n\n${jsonInstructions}\n\nUser request: ${options.prompt}`
    : `${jsonInstructions}\n\nUser request: ${options.prompt}`;

  // Use a temp directory for the working directory
  const tempDir = path.join(os.tmpdir(), 'sentryvibe-ai');
  ensureDir(tempDir);
  
  const sdkOptions: Options = {
    model: modelName,
    maxTurns: 1, // Single turn, no tool use needed
    tools: [], // Empty array disables all built-in tools
    cwd: tempDir,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    env: getCleanEnv(),
  };

  let responseText = '';

  try {
    // Collect text from the SDK stream
    for await (const message of query({ prompt: fullPrompt, options: sdkOptions })) {
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            responseText += block.text;
          }
        }
      }
    }
  } catch (error) {
    console.error('[anthropic-client] SDK query failed:', error);
    throw error;
  }

  if (!responseText) {
    throw new Error('No text response from Claude Agent SDK');
  }

  // Clean up any markdown code blocks if present
  let jsonText = responseText.trim();
  const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1].trim();
  }
  
  // Try to extract JSON object
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonText = jsonMatch[0];
  }

  // Parse and validate
  const parsed = JSON.parse(jsonText);
  const validated = options.schema.parse(parsed);
  
  return { object: validated };
}

/**
 * Simple text completion using Claude Agent SDK
 */
export async function generateText(options: {
  model: string;
  prompt: string;
  system?: string;
}): Promise<{ text: string }> {
  const modelName = resolveModelName(options.model);
  const tempDir = path.join(os.tmpdir(), 'sentryvibe-ai');
  ensureDir(tempDir);

  const fullPrompt = options.system 
    ? `${options.system}\n\n${options.prompt}`
    : options.prompt;

  const sdkOptions: Options = {
    model: modelName,
    maxTurns: 1,
    tools: [], // Empty array disables all built-in tools
    cwd: tempDir,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    env: getCleanEnv(),
  };

  let responseText = '';

  for await (const message of query({ prompt: fullPrompt, options: sdkOptions })) {
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text') {
          responseText += block.text;
        }
      }
    }
  }

  return { text: responseText };
}

/**
 * Streaming text completion using Claude Agent SDK
 * Returns an async generator that yields text chunks
 */
export async function* streamTextWithSDK(options: {
  model: string;
  prompt: string;
  system?: string;
}): AsyncGenerator<string, void, unknown> {
  const modelName = resolveModelName(options.model);
  const tempDir = path.join(os.tmpdir(), 'sentryvibe-ai');
  ensureDir(tempDir);

  const fullPrompt = options.system 
    ? `${options.system}\n\n${options.prompt}`
    : options.prompt;

  const sdkOptions: Options = {
    model: modelName,
    maxTurns: 1,
    tools: [], // Empty array disables all built-in tools
    cwd: tempDir,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    includePartialMessages: true, // Enable streaming deltas
    env: getCleanEnv(),
  };

  for await (const message of query({ prompt: fullPrompt, options: sdkOptions })) {
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text') {
          yield block.text;
        }
      }
    }
  }
}
