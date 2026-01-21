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
    // Capture stderr for debugging
    stderr: (data: string) => {
      console.error('[anthropic-client] SDK stderr:', data);
    },
  };

  let responseText = '';

  try {
    // Collect text from the SDK stream
    for await (const message of query({ prompt: fullPrompt, options: sdkOptions })) {
      // Log message types for debugging
      if (message.type === 'system' && 'subtype' in message && message.subtype === 'init') {
        console.log('[anthropic-client] SDK initialized:', {
          model: message.model,
          apiKeySource: message.apiKeySource,
          tools: message.tools?.length || 0,
        });
      }
      
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            responseText += block.text;
          }
        }
      }
      
      // Log result messages for debugging
      if (message.type === 'result') {
        if (message.subtype !== 'success') {
          console.error('[anthropic-client] SDK result error:', message.subtype, 'errors' in message ? message.errors : '');
        }
      }
    }
  } catch (error) {
    console.error('[anthropic-client] SDK query failed:', error);
    // Log more context about the error
    if (error instanceof Error) {
      console.error('[anthropic-client] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      });
    }
    // Check if ANTHROPIC_API_KEY is set
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
    console.error('[anthropic-client] ANTHROPIC_API_KEY present:', hasApiKey);
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


