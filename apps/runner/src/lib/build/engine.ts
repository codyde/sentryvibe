import { existsSync, mkdirSync } from 'fs';

type AgentId = 'claude-code' | 'openai-codex';

type BuildQueryFn = (
  prompt: string,
  workingDirectory: string,
  systemPrompt: string,
  agent?: AgentId
) => AsyncGenerator<unknown, void, unknown>;

interface BuildStreamOptions {
  projectId: string;
  prompt: string;
  operationType: string;
  context?: Record<string, unknown>;
  query: BuildQueryFn;
  workingDirectory: string;
  systemPrompt: string;
  agent: AgentId;
  isNewProject?: boolean;
}

/**
 * Create a build stream that executes the Claude query and returns a stream
 */
export async function createBuildStream(options: BuildStreamOptions): Promise<ReadableStream> {
  const { prompt, query, context, workingDirectory, systemPrompt, agent, isNewProject } = options;

  // For Codex on NEW projects, use parent directory as CWD (Codex will create the project dir)
  // For everything else, use the project directory
  const isCodexNewProject = agent === 'openai-codex' && isNewProject;

  let actualWorkingDir = workingDirectory;
  if (isCodexNewProject) {
    // Use parent directory - Codex will create the project subdirectory
    const path = await import('path');
    actualWorkingDir = path.dirname(workingDirectory);
    console.log(`[engine] Codex NEW project - using parent dir as CWD: ${actualWorkingDir}`);
    console.log(`[engine] Codex will create: ${path.basename(workingDirectory)}`);
  } else {
    // Ensure the working directory exists for Claude or existing projects
    if (!existsSync(workingDirectory)) {
      mkdirSync(workingDirectory, { recursive: true });
    }
    console.log(`[engine] Using project directory as CWD: ${actualWorkingDir}`);
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

  const generator = query(fullPrompt, actualWorkingDir, systemPrompt, agent);


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
