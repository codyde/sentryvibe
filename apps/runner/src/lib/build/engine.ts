import * as Sentry from '@sentry/node';
/**
 * Build engine for creating and streaming build responses
 * This is a simplified version for the runner MVP
 */

import { existsSync, mkdirSync } from 'fs';

interface BuildStreamOptions {
  projectId: string;
  prompt: string;
  operationType: string;
  context?: Record<string, unknown>;
  query: (...args: unknown[]) => AsyncGenerator<unknown, void, unknown>;
  workingDirectory: string;
  systemPrompt: string;
}

/**
 * Create a build stream that executes the Claude query and returns a stream
 */
export async function createBuildStream(options: BuildStreamOptions): Promise<ReadableStream> {
  const { prompt, query, context, workingDirectory, systemPrompt } = options;

  // Ensure the working directory exists
  if (!existsSync(workingDirectory)) {
    mkdirSync(workingDirectory, { recursive: true });
  }

  // Store the original CWD to restore it later
  const originalCwd = process.cwd();

  // Change to the project directory
  process.chdir(workingDirectory);

  // Build the full prompt with context
  let fullPrompt = prompt;

  if (context && Object.keys(context).length > 0) {
    fullPrompt = `${fullPrompt}\n\nContext: ${JSON.stringify(context, null, 2)}`;
  }

  // Pass prompt, working directory, and system prompt to the query function
  // The buildQuery wrapper will configure the SDK with all options
  
  const generator = Sentry.startSpan({
    op: "function",
    name: "createBuildStream",
  }, () => {
  return query(fullPrompt, workingDirectory, systemPrompt);
  });

  // Create a ReadableStream from the AsyncGenerator
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          // Convert chunk to appropriate format
          if (typeof chunk === 'string') {
            controller.enqueue(new TextEncoder().encode(chunk));
          } else if (chunk instanceof Uint8Array) {
            controller.enqueue(chunk);
          } else if (typeof chunk === 'object') {
            controller.enqueue(new TextEncoder().encode(JSON.stringify(chunk)));
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        // Restore the original working directory
        process.chdir(originalCwd);
      }
    },
  });

  return stream;
}
