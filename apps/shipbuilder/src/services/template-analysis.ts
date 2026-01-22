import { Codex } from '@openai/codex-sdk';
import {
  DEFAULT_CLAUDE_MODEL_ID,
  CLAUDE_MODEL_METADATA,
  getClaudeModelLabel,
  type AgentId,
  type ClaudeModelId,
} from '@shipbuilder/agent-core/types/agent';
import type { Template } from '@shipbuilder/agent-core/lib/templates/config';
import { generateStructuredOutput } from '@/lib/anthropic-client';
import { TemplateAnalysisSchema, ProjectNamingSchema } from '../schemas/metadata';

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
  'claude-opus-4-5': {
    provider: 'anthropic',
    model: 'claude-opus-4-5',
    displayName: CLAUDE_MODEL_METADATA['claude-opus-4-5'].label,
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
  projectName?: string; // Optional - included when generated separately
}

/**
 * Generate project name and slug from user prompt using AI
 * Uses Haiku for speed and cost efficiency
 * Returns both friendly name (Title Case) and slug (kebab-case)
 */
export async function generateProjectName(
  prompt: string,
  selectedAgent: AgentId,
  claudeModel?: ClaudeModelId
): Promise<{ slug: string; friendlyName: string }> {
  const namePrompt = `Extract the core project concept from this request and create appropriate names:

User's project request: "${prompt}"

IMPORTANT: Extract only the PROJECT TYPE/CONCEPT. Ignore all conversational phrases:
- Ignore: "I want", "I need", "I would like", "please", "can you", "build me", "create me", "make me"
- Ignore: "a", "an", "the", "using", "with", "for me"
- Focus ONLY on WHAT is being built, not how the user asked for it

Generate:
1. A URL-friendly slug (lowercase, hyphens, 2-4 words, max 30 chars)
2. A human-readable friendly name (Title Case, 2-5 words)

Examples:
- "I want to build a todo app" → slug: "todo-app", friendlyName: "Todo App"
- "I want a workflow automation tool" → slug: "workflow-automation", friendlyName: "Workflow Automation"
- "Can you create an error monitoring dashboard for me" → slug: "error-monitoring", friendlyName: "Error Monitoring Dashboard"
- "I need a chat app with real-time messaging please" → slug: "realtime-chat", friendlyName: "Realtime Chat"
- "Build me a personal blog site" → slug: "personal-blog", friendlyName: "Personal Blog"
- "I would like an AI workflow orchestration platform" → slug: "ai-workflow-platform", friendlyName: "AI Workflow Platform"

Requirements:
- Slug: lowercase, hyphens only, no special characters, max 30 chars
- Friendly name: Title Case, readable, professional, 2-5 words
- NEVER include words like "want", "need", "please", "build", "create", "make" in the output
- Focus on the core product/application concept`;

  try {
    console.log('[generateProjectName] 🚀 Starting AI name generation...');
    console.log('[generateProjectName] Model: claude-haiku-4-5');
    console.log('[generateProjectName] Prompt preview:', prompt.substring(0, 100));
    
    const result = await generateStructuredOutput({
      model: 'claude-haiku-4-5',
      schema: ProjectNamingSchema,
      prompt: namePrompt,
    });

    console.log('[generateProjectName] ✅ AI response received:', result.object);
    const { slug, friendlyName } = result.object;

    // Validate slug
    if (slug.length < 2 || slug.length > 100 || !/^[a-z0-9-]+$/.test(slug)) {
      throw new Error('Generated slug is invalid format');
    }

    return { slug, friendlyName };
  } catch (error) {
    console.error('[generateProjectName] ❌ AI name generation failed:', error instanceof Error ? error.message : error);
    console.error('[generateProjectName] 📋 Falling back to word extraction from prompt');

    // Fallback: generate simple slug and title-case it for friendly name
    const words = prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .filter(w => !['the', 'and', 'for', 'with', 'build', 'create', 'make', 'want', 'need', 'please', 'can', 'you', 'help', 'using', 'should', 'could', 'would', 'like', 'some', 'new'].includes(w))
      .slice(0, 4);

    const slug = words.length > 0 ? words.join('-') : 'new-project';
    const friendlyName = words.length > 0
      ? words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      : 'New Project';

    return { slug, friendlyName };
  }
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
  console.log('[analyzePromptForTemplate] 🎯 Starting template analysis');
  console.log('[analyzePromptForTemplate] Agent:', selectedAgent, 'Claude model:', claudeModel);
  console.log('[analyzePromptForTemplate] Available templates:', templates.length);
  
  const modelConfig = getAnalysisModelConfig(selectedAgent, claudeModel);
  console.log('[analyzePromptForTemplate] Model config:', modelConfig);
  
  const systemPrompt = buildTemplateSelectionPrompt(templates, selectedAgent, claudeModel);

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

  let result: { templateId: string; reasoning: string; confidence: number };
  try {
    result = JSON.parse(cleanedResponse);
  } catch (error) {
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
  console.log('[analyzeWithClaude] 🚀 Starting template analysis...');
  console.log('[analyzeWithClaude] Model:', model);
  console.log('[analyzeWithClaude] Prompt preview:', userPrompt.substring(0, 100));
  
  const combinedPrompt = `${systemPrompt}\n\nUser's build request: ${userPrompt}`;

  try {
    const result = await generateStructuredOutput({
      model: model,
      schema: TemplateAnalysisSchema,
      prompt: combinedPrompt,
    });

    console.log('[analyzeWithClaude] ✅ AI response received:', result.object);
    return JSON.stringify(result.object);
  } catch (error) {
    console.error('[analyzeWithClaude] ❌ AI call failed:', error instanceof Error ? error.message : error);
    console.error('[analyzeWithClaude] Full error:', error);
    throw error;
  }
}

async function analyzeWithOpenAI(
  systemPrompt: string,
  userPrompt: string,
  model: string
): Promise<string> {
  try {
    // Note: Codex is auto-instrumented by Sentry's openAIIntegration via OTel
    const codex = new Codex();

    const thread = codex.startThread({
      sandboxMode: 'danger-full-access',
      model,
      workingDirectory: process.cwd(),
      skipGitRepoCheck: true,
    });

    const combinedPrompt = `${systemPrompt}\n\nUser's build request: ${userPrompt}`;
    const { events } = await thread.runStreamed(combinedPrompt);
    let accumulated = '';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const event of events as AsyncIterable<any>) {
      if (event?.type === 'item.completed') {
        const item = event.item as Record<string, unknown> | undefined;
        const text = typeof item?.text === 'string' ? item.text : undefined;
        if (text) {
          accumulated += text;
        }
      } else if (event?.type === 'turn.completed' && typeof event.finalResponse === 'string') {
        accumulated += event.finalResponse;
      }
    }

    if (!accumulated) {
      throw new Error('Codex returned no response for template analysis');
    }

    return accumulated;
  } catch (error) {
    throw error;
  }
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
- **template_tanstackstart**: TanStack Start foundation with Router/Query + Tailwind for customizable full-stack builds

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
