import * as Sentry from '@sentry/node';
import type { AgentId } from '@sentryvibe/agent-core/types/agent';
import type { Template } from '@sentryvibe/agent-core/lib/templates/config';

interface AnalysisModelConfig {
  provider: 'anthropic' | 'openai';
  model: string;
  displayName: string;
}

// Models used for template analysis
const ANALYSIS_MODELS: Record<AgentId, AnalysisModelConfig> = {
  'claude-code': {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    displayName: 'Claude Sonnet 4.5',
  },
  'openai-codex': {
    provider: 'openai',
    model: 'gpt-5-codex', // Matches CODEX_MODEL in runner
    displayName: 'GPT-5 Codex',
  },
};

export interface TemplateAnalysisResult {
  templateId: string;
  templateName: string;
  framework: string;
  defaultPort: number;
  devCommand: string;
  repository: string;
  branch: string;
  reasoning: string;
  confidence: number;
  analyzedBy: string;
}

/**
 * Analyze user prompt and select best template using the agent's own model
 */
export async function analyzePromptForTemplate(
  prompt: string,
  selectedAgent: AgentId,
  templates: Template[]
): Promise<TemplateAnalysisResult> {
  const modelConfig = ANALYSIS_MODELS[selectedAgent];
  const systemPrompt = buildTemplateSelectionPrompt(templates, selectedAgent);

  console.log(`[template-analysis] Using ${modelConfig.displayName} for template selection`);

  let analysisResponse: string;

  if (modelConfig.provider === 'anthropic') {
    analysisResponse = await analyzeWithClaude(
      systemPrompt,
      prompt,
      modelConfig.model
    );
  } else {
    analysisResponse = await analyzeWithOpenAI(
      systemPrompt,
      prompt,
      modelConfig.model
    );
  }

  // Strip markdown code blocks if present (```json ... ```)
  let cleanedResponse = analysisResponse.trim();
  const codeBlockMatch = cleanedResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    cleanedResponse = codeBlockMatch[1].trim();
  }

  const result = JSON.parse(cleanedResponse);

  // Find full template metadata
  const template = templates.find(t => t.id === result.templateId);
  if (!template) {
    throw new Error(`Template ${result.templateId} not found in available templates`);
  }

  return {
    templateId: template.id,
    templateName: template.name,
    framework: template.tech.framework,
    defaultPort: template.setup.defaultPort,
    devCommand: template.setup.devCommand,
    repository: template.repository,
    branch: template.branch,
    reasoning: result.reasoning,
    confidence: result.confidence,
    analyzedBy: modelConfig.displayName,
  };
}

async function analyzeWithClaude(
  systemPrompt: string,
  userPrompt: string,
  model: string
): Promise<string> {
  // Use Sentry instrumented Claude Code SDK (same as runner)
  const query = Sentry.createInstrumentedClaudeQuery();

  const combinedPrompt = `User's build request: ${userPrompt}\n\nSelect the best template for you to build and explain why.`;

  // Run single-turn query for template selection
  const generator = query({
    prompt: combinedPrompt,
    options: {
      model,
      systemPrompt,
      maxTurns: 1, // Only need one response for template selection
    },
  });

  let finalResponse = '';

  // Collect the response
  for await (const message of generator) {
    if (message.type === 'assistant' && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === 'text' && block.text) {
          finalResponse += block.text;
        }
      }
    }
  }

  return finalResponse;
}

async function analyzeWithOpenAI(
  systemPrompt: string,
  userPrompt: string,
  model: string
): Promise<string> {
  // Use Sentry instrumented Codex SDK (same as runner)
  const codex = await Sentry.createInstrumentedCodex({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const thread = codex.startThread({
    sandboxMode: 'workspace-write', // Workspace-write mode for template analysis
    model,
  });

  const combinedPrompt = `${systemPrompt}\n\nUser's build request: ${userPrompt}\n\nSelect the best template for you to build and explain why.`;

  const result = await thread.run(combinedPrompt);

  // Extract text from Codex response
  return result.finalResponse ?? '{}';
}

function buildTemplateSelectionPrompt(templates: Template[], agent: AgentId): string {
  const agentName = agent === 'claude-code' ? 'Claude Sonnet 4.5' : 'GPT-5 Codex';

  return `You are ${agentName}, and you will be building this project.
Your task: Select the BEST template for YOU to start from.

Available templates:
${templates
  .map(
    t => `
## ${t.name} (ID: ${t.id})
${t.description}

Keywords: ${t.selection.keywords.join(', ')}

Use cases:
${t.selection.useCases.map(uc => `- ${uc}`).join('\n')}

Example requests:
${t.selection.examples.map(ex => `- "${ex}"`).join('\n')}

Tech: ${t.tech.framework} ${t.tech.version}, ${t.tech.language}, ${t.tech.styling}${t.tech.uiLibrary ? `, ${t.tech.uiLibrary}` : ''}

Default port: ${t.setup.defaultPort}
Dev command: ${t.setup.devCommand}
`
  )
  .join('\n---\n')}

Selection Guidelines:
- **react-vite**: Simple SPAs, prototypes, basic UIs (default for unclear requests)
- **nextjs-fullstack**: Full-stack apps needing auth, database, API routes, SSR
- **vite-react-node**: SPAs with separate backend, real-time apps, WebSocket
- **astro-static**: Blogs, documentation, landing pages, marketing sites

CRITICAL INSTRUCTIONS:
1. Analyze the user's request carefully
2. Consider YOUR strengths as ${agentName}
3. Select the template that YOU can build most effectively
4. Explain your reasoning concisely (focus on why this template fits the request)
5. Provide a confidence score (0.0 to 1.0)

RESPONSE FORMAT REQUIREMENT:
You MUST respond with ONLY valid JSON. Do NOT wrap it in markdown code blocks. Do NOT include any text before or after the JSON.

Return EXACTLY this structure with no additional formatting:
{
  "templateId": "nextjs-fullstack",
  "reasoning": "User needs authentication and database. Next.js 15 provides App Router with built-in API routes. I can effectively implement auth patterns and database integration in this framework.",
  "confidence": 0.95
}

VALID templateId values: ${templates.map(t => t.id).join(', ')}

Respond now with ONLY the JSON object, nothing else.`;
}
