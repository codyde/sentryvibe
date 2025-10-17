import { analyzePromptForTemplate } from '@/services/template-analysis';
import type { AgentId } from '@sentryvibe/agent-core/types/agent';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Template } from '@sentryvibe/agent-core/lib/templates/config';

export const maxDuration = 30;

interface TemplateConfig {
  version: string;
  templates: Template[];
}

async function loadTemplates(): Promise<Template[]> {
  const templatesPath = join(process.cwd(), 'templates.json');
  const content = await readFile(templatesPath, 'utf-8');
  const config: TemplateConfig = JSON.parse(content);
  return config.templates;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const { prompt, selectedAgent } = body as {
      prompt: string;
      selectedAgent: AgentId;
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

    // Load available templates
    const templates = await loadTemplates();
    console.log(`[analyze-route] Loaded ${templates.length} templates`);

    // Analyze prompt using the agent's model
    const analysis = await analyzePromptForTemplate(prompt, selectedAgent, templates);

    console.log(`[analyze-route] Analysis complete`);
    console.log(`[analyze-route] Selected template: ${analysis.templateName}`);
    console.log(`[analyze-route] Confidence: ${analysis.confidence}`);
    console.log(`[analyze-route] Analyzed by: ${analysis.analyzedBy}`);

    return new Response(
      JSON.stringify({
        template: {
          id: analysis.templateId,
          name: analysis.templateName,
          framework: analysis.framework,
          port: analysis.defaultPort,
          runCommand: analysis.devCommand,
          repository: analysis.repository,
          branch: analysis.branch,
        },
        reasoning: analysis.reasoning,
        confidence: analysis.confidence,
        analyzedBy: analysis.analyzedBy,
      }),
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
