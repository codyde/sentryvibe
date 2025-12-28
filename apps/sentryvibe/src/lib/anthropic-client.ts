/**
 * Anthropic SDK Client Wrapper
 * 
 * Provides simple utilities for making Anthropic API calls directly,
 * replacing the AI SDK provider for consistency with the native Claude Agent SDK.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// Create a singleton Anthropic client
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      // Uses ANTHROPIC_API_KEY from environment by default
    });
  }
  return anthropicClient;
}

// Map our model IDs to Anthropic API model names
const MODEL_MAP: Record<string, string> = {
  'claude-haiku-4-5': 'claude-sonnet-4-20250514', // Haiku 4.5 not available yet, use Sonnet
  'claude-sonnet-4-5': 'claude-sonnet-4-20250514',
  'claude-opus-4-5': 'claude-sonnet-4-20250514', // Opus 4.5 not available yet, use Sonnet
  'claude-3-5-haiku-latest': 'claude-3-5-haiku-latest',
  'claude-3-5-sonnet-latest': 'claude-3-5-sonnet-latest',
};

function resolveModelName(modelId: string): string {
  return MODEL_MAP[modelId] || 'claude-sonnet-4-20250514';
}

interface GenerateObjectOptions<T extends z.ZodType> {
  model: string;
  schema: T;
  prompt: string;
  system?: string;
  maxTokens?: number;
}

/**
 * Generate a structured object using the Anthropic API with JSON mode.
 * This is a replacement for the AI SDK's generateObject function.
 */
export async function generateStructuredOutput<T extends z.ZodType>(
  options: GenerateObjectOptions<T>
): Promise<{ object: z.infer<T> }> {
  const client = getAnthropicClient();
  const modelName = resolveModelName(options.model);
  
  // Build the prompt that instructs Claude to output valid JSON
  const jsonInstructions = `You must respond with ONLY valid JSON that matches this schema. Do not include any text before or after the JSON object. Do not wrap in markdown code blocks.

JSON Schema:
${JSON.stringify(zodToJsonSchema(options.schema), null, 2)}

CRITICAL: Your response must START with { and END with }. Output only the JSON object.`;

  const fullPrompt = options.system 
    ? `${options.system}\n\n${jsonInstructions}\n\nUser request: ${options.prompt}`
    : `${jsonInstructions}\n\nUser request: ${options.prompt}`;

  const response = await client.messages.create({
    model: modelName,
    max_tokens: options.maxTokens || 1024,
    messages: [
      {
        role: 'user',
        content: fullPrompt,
      },
    ],
  });

  // Extract text from the response
  const textBlock = response.content.find(block => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Anthropic API');
  }

  let jsonText = textBlock.text.trim();
  
  // Clean up any markdown code blocks if present
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
 * Simple text completion using Anthropic API
 */
export async function generateText(options: {
  model: string;
  prompt: string;
  system?: string;
  maxTokens?: number;
}): Promise<{ text: string }> {
  const client = getAnthropicClient();
  const modelName = resolveModelName(options.model);

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: options.prompt,
    },
  ];

  const response = await client.messages.create({
    model: modelName,
    max_tokens: options.maxTokens || 4096,
    system: options.system,
    messages,
  });

  const textBlock = response.content.find(block => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Anthropic API');
  }

  return { text: textBlock.text };
}

/**
 * Streaming text completion using Anthropic API
 * Returns an async generator that yields text chunks
 */
export async function* streamText(options: {
  model: string;
  prompt: string;
  system?: string;
  maxTokens?: number;
}): AsyncGenerator<string, void, unknown> {
  const client = getAnthropicClient();
  const modelName = resolveModelName(options.model);

  const stream = await client.messages.stream({
    model: modelName,
    max_tokens: options.maxTokens || 4096,
    system: options.system,
    messages: [
      {
        role: 'user',
        content: options.prompt,
      },
    ],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}

/**
 * Convert a Zod schema to a JSON Schema representation for the prompt
 * This is a simplified conversion - extend as needed
 */
function zodToJsonSchema(schema: z.ZodType): object {
  // Handle ZodObject
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, object> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodType);
      // Check if field is required (not optional)
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  // Handle ZodString
  if (schema instanceof z.ZodString) {
    return { type: 'string' };
  }

  // Handle ZodNumber
  if (schema instanceof z.ZodNumber) {
    return { type: 'number' };
  }

  // Handle ZodBoolean
  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }

  // Handle ZodArray
  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToJsonSchema(schema.element),
    };
  }

  // Handle ZodEnum
  if (schema instanceof z.ZodEnum) {
    return {
      type: 'string',
      enum: schema.options,
    };
  }

  // Handle ZodOptional
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }

  // Handle ZodDefault
  if (schema instanceof z.ZodDefault) {
    return zodToJsonSchema(schema._def.innerType);
  }

  // Fallback
  return { type: 'string' };
}

export { getAnthropicClient };
