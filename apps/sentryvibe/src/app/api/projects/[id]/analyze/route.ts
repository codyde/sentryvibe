import { sendCommandToRunner } from '@sentryvibe/agent-core/lib/runner/broker-state';
import { addRunnerEventSubscriber } from '@sentryvibe/agent-core/lib/runner/event-stream';
import type { RunnerEvent } from '@/shared/runner/messages';
import { randomUUID } from 'crypto';
import {
  DEFAULT_CLAUDE_MODEL_ID,
  type AgentId,
  type ClaudeModelId,
} from '@sentryvibe/agent-core/types/agent';

export const maxDuration = 30;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const { prompt, selectedAgent, claudeModel } = body as {
      prompt: string;
      selectedAgent: AgentId;
      claudeModel?: ClaudeModelId;
    };

    if (!prompt || !selectedAgent) {
      return new Response(
        JSON.stringify({ error: 'prompt and selectedAgent are required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate agent
    if (selectedAgent !== 'claude-code' && selectedAgent !== 'openai-codex') {
      return new Response(
        JSON.stringify({ error: 'Invalid agent. Must be claude-code or openai-codex' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`[analyze-route] Analyzing prompt for project ${id}`);
    console.log(`[analyze-route] Selected agent: ${selectedAgent}`);
    console.log(`[analyze-route] Prompt: ${prompt.substring(0, 100)}...`);

    // NEW: Send analysis request to runner and wait for response
    const commandId = randomUUID();
    const runnerId = process.env.RUNNER_DEFAULT_ID || 'local';

    // Create a promise that resolves when we get the template-analyzed event
    const analysisPromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Analysis timeout - runner did not respond within 30s'));
      }, 30000);

      const cleanup = addRunnerEventSubscriber((event: RunnerEvent) => {
        if (event.commandId === commandId && event.type === 'template-analyzed') {
          clearTimeout(timeout);
          cleanup();
          resolve(event.payload);
        } else if (event.commandId === commandId && event.type === 'error') {
          clearTimeout(timeout);
          cleanup();
          reject(new Error(event.error));
        }
      });
    });

    // Send command to runner
    await sendCommandToRunner(runnerId, {
      id: commandId,
      type: 'analyze-template',
      projectId: id,
      timestamp: new Date().toISOString(),
      payload: {
        prompt,
        agent: selectedAgent,
        claudeModel: selectedAgent === 'claude-code' && (claudeModel === 'claude-haiku-4-5' || claudeModel === 'claude-sonnet-4-5')
          ? claudeModel
          : DEFAULT_CLAUDE_MODEL_ID,
      },
    });

    console.log(`[analyze-route] Waiting for runner analysis...`);

    // Wait for runner to respond
    const analysis = await analysisPromise;

    console.log(`[analyze-route] Analysis complete from runner`);
    console.log(`[analyze-route] Selected template: ${analysis.template.name}`);

    return new Response(
      JSON.stringify(analysis),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[analyze-route] Analysis failed:', error);

    return new Response(
      JSON.stringify({
        error: 'Template analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
