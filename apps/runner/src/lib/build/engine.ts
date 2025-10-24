import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import type { AgentId, ClaudeModelId } from '@sentryvibe/agent-core/types/agent';
import { resolveAgentStrategy } from '@sentryvibe/agent-core/lib/agents';

type BuildQueryFn = (
  prompt: string,
  workingDirectory: string,
  systemPrompt: string,
  agent?: AgentId
) => AsyncGenerator<unknown, void, unknown>;

interface BuildStreamOptions {
  projectId: string;
  projectName: string;
  prompt: string;
  operationType: string;
  context?: Record<string, unknown>;
  query: BuildQueryFn;
  workingDirectory: string;
  systemPrompt: string;
  agent: AgentId;
  isNewProject?: boolean;
  claudeModel?: ClaudeModelId;
}

/**
 * Create a build stream that executes the Claude query and returns a stream
 */
export async function createBuildStream(options: BuildStreamOptions): Promise<ReadableStream> {
  const { prompt, query, context, workingDirectory, systemPrompt, agent, isNewProject } = options;

  // For Codex on NEW projects, use parent directory as CWD (Codex will create the project dir)
  // For everything else, use the project directory
  const strategy = await resolveAgentStrategy(agent);
  const projectName = options.projectName || path.basename(workingDirectory);
  const strategyContext = {
    projectId: options.projectId,
    projectName,
    prompt,
    workingDirectory,
    operationType: options.operationType,
    isNewProject: !!isNewProject,
  };

  const resolvedDir = strategy.resolveWorkingDirectory?.(strategyContext);
  const actualWorkingDir = resolvedDir ?? workingDirectory;

  if (resolvedDir) {
    if (process.env.DEBUG_BUILD === '1') console.log(`[engine] Strategy adjusted CWD to: ${actualWorkingDir}`);
  } else if (!existsSync(workingDirectory)) {
    mkdirSync(workingDirectory, { recursive: true });
  }

  if (!resolvedDir) {
    if (process.env.DEBUG_BUILD === '1') console.log(`[engine] Using project directory as CWD: ${actualWorkingDir}`);
  }

  // Store the original CWD to restore it later
  const originalCwd = process.cwd();

  // Change to the appropriate directory
  process.chdir(actualWorkingDir);

  // Build the full prompt with context
  let fullPrompt = prompt;

  if (context && Object.keys(context).length > 0) {
    fullPrompt = `${fullPrompt}\n\nContext: ${JSON.stringify(context, null, 2)}`;
  }

  // Pass prompt, working directory, and system prompt to the query function
  // The buildQuery wrapper will configure the SDK with all options
  // Use actualWorkingDir so the query function gets the correct CWD

  console.log('[build-engine] 🚀 Creating generator with query function...');
  const generator = query(fullPrompt, actualWorkingDir, systemPrompt, agent);

  console.log('[build-engine] 📦 Creating ReadableStream from generator...');
  // Create a ReadableStream from the AsyncGenerator
  const stream = new ReadableStream({
    async start(controller) {
      console.log('[build-engine] ▶️  Stream start() called, beginning to consume generator...');
      let chunkCount = 0;
      try {
        for await (const chunk of generator) {
          chunkCount++;
          if (chunkCount % 5 === 0) {
            console.log(`[build-engine] Processed ${chunkCount} chunks from generator`);
          }
          // Convert chunk to appropriate format
          if (typeof chunk === 'string') {
            controller.enqueue(new TextEncoder().encode(chunk));
          } else if (chunk instanceof Uint8Array) {
            controller.enqueue(chunk);
          } else if (typeof chunk === 'object') {
            controller.enqueue(new TextEncoder().encode(JSON.stringify(chunk)));
          }
        }
        console.log(`[build-engine] ✅ Generator exhausted after ${chunkCount} chunks, closing stream`);
        controller.close();
      } catch (error) {
        console.error('[build-engine] ❌ Error consuming generator:', error);
        controller.error(error);
      } finally {
        // Restore the original working directory
        process.chdir(originalCwd);
      }
    },
  });

  console.log('[build-engine] ✅ Stream created and returned');
  return stream;
}
