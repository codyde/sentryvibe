import * as Sentry from '@sentry/node';
import {
  DEFAULT_CLAUDE_MODEL_ID,
  CLAUDE_MODEL_METADATA,
  getClaudeModelLabel,
  type AgentId,
  type ClaudeModelId,
} from '@sentryvibe/agent-core/types/agent';
import type { Template } from '@sentryvibe/agent-core/lib/templates/config';

interface AnalysisModelConfig {
  provider: 'anthropic' | 'openai';
  model: string;
  displayName: string;
}

const CLAUDE_ANALYSIS_MODELS: Record<ClaudeModelId, AnalysisModelConfig> = {
  'claude-haiku-4-5': {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    displayName: CLAUDE_MODEL_METADATA['claude-haiku-4-5'].label,
  },
  'claude-sonnet-4-5': {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    displayName: CLAUDE_MODEL_METADATA['claude-sonnet-4-5'].label,
  },
};

const OPENAI_ANALYSIS_MODEL: AnalysisModelConfig = {
  provider: 'openai',
  model: 'gpt-5-codex',
  displayName: 'GPT-5 Codex',
};

function getAnalysisModelConfig(agent: AgentId, claudeModel?: ClaudeModelId): AnalysisModelConfig {
  if (agent === 'openai-codex') {
    return OPENAI_ANALYSIS_MODEL;
  }

  const resolvedModel = claudeModel && CLAUDE_ANALYSIS_MODELS[claudeModel]
    ? claudeModel
    : DEFAULT_CLAUDE_MODEL_ID;

  return CLAUDE_ANALYSIS_MODELS[resolvedModel];
}

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
  templates: Template[],
  claudeModel?: ClaudeModelId,
): Promise<TemplateAnalysisResult> {
  const modelConfig = getAnalysisModelConfig(selectedAgent, claudeModel);
  const systemPrompt = buildTemplateSelectionPrompt(templates, selectedAgent, claudeModel);

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

  // Try to extract JSON object from response (in case Claude added text before/after)
  const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleanedResponse = jsonMatch[0];
  }

  let result;
  try {
    result = JSON.parse(cleanedResponse);
  } catch (error) {
    console.error('[template-analysis] Failed to parse JSON response');
    console.error('[template-analysis] Raw response:', analysisResponse.substring(0, 200));
    console.error('[template-analysis] Cleaned response:', cleanedResponse.substring(0, 200));
    throw new Error(`Invalid JSON from template analysis: ${error instanceof Error ? error.message : 'Parse failed'}`);
  }

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
    analyzedBy:
      selectedAgent === 'claude-code'
        ? getClaudeModelLabel(claudeModel ?? DEFAULT_CLAUDE_MODEL_ID)
        : modelConfig.displayName,
  };
}

async function analyzeWithClaude(
  systemPrompt: string,
  userPrompt: string,
  model: string
): Promise<string> {
  // For simple analysis, use direct Anthropic API (not Claude Code SDK)
  // Claude Code SDK is for file operations, this is just text generation
  const Anthropic = await import('@anthropic-ai/sdk').then(m => m.default);

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const combinedPrompt = `${systemPrompt}\n\nUser's build request: ${userPrompt}`;

  console.log('[template-analysis] Calling Anthropic API for template selection...');

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: 'You are a template selection expert. Respond with ONLY valid JSON.',
    messages: [{
      role: 'user',
      content: combinedPrompt,
    }],
  });

  console.log('[template-analysis] Received response from Anthropic');

  // Extract text from response
  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text content in Anthropic response');
  }

  // Extract JSON from response
  const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in Claude response');
  }

  return jsonMatch[0];
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

  // Just pass the user's request - system prompt already explains what to do
  const combinedPrompt = `${systemPrompt}\n\nUser's build request: ${userPrompt}`;

  const result = await thread.run(combinedPrompt);

  // Extract text from Codex response
  return result.finalResponse ?? '{}';
}

function buildTemplateSelectionPrompt(
  templates: Template[],
  agent: AgentId,
  claudeModel?: ClaudeModelId,
): string {
  const agentName =
    agent === 'claude-code'
      ? getClaudeModelLabel(claudeModel ?? DEFAULT_CLAUDE_MODEL_ID)
      : 'GPT-5 Codex';

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

CRITICAL: Your response must START with { and END with }. No explanations, no thoughts, no "I'll", no "Let me", just the JSON object.`;
}
