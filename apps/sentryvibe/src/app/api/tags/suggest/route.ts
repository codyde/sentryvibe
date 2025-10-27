import { Anthropic } from '@anthropic-ai/sdk';
import { TAG_DEFINITIONS, findTagDefinition } from '@sentryvibe/agent-core/config/tags';

export const maxDuration = 30;

const anthropic = new Anthropic({
});

interface SuggestedTag {
  key: string;
  value: string;
  expandedValues?: Record<string, string>;
  reasoning: string;
}

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Build the system prompt with available tag options
    const systemPrompt = buildTagSuggestionPrompt();

    // Call Anthropic API
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      temperature: 0.3, // Lower temperature for more consistent suggestions
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Analyze this project description and suggest appropriate tags:\n\n"${prompt}"\n\nReturn ONLY a JSON array of tag suggestions.`
        }
      ]
    });

    // Extract JSON from response
    const textContent = message.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in response');
    }

    // Parse JSON from response (handle markdown code blocks)
    let jsonText = textContent.text.trim();

    // Remove markdown code fences if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    const suggestedTags: SuggestedTag[] = JSON.parse(jsonText);

    // Validate and expand tags
    const processedTags = suggestedTags
      .filter(tag => {
        const def = findTagDefinition(tag.key);
        return def !== undefined;
      })
      .map(tag => {
        // Handle brand tags - expand values
        if (tag.key === 'brand') {
          const brandDef = findTagDefinition('brand');
          const brandOption = brandDef?.options?.find(o => o.value === tag.value);
          if (brandOption?.values) {
            return {
              key: tag.key,
              value: tag.value,
              expandedValues: brandOption.values
            };
          }
        }

        return {
          key: tag.key,
          value: tag.value,
          expandedValues: tag.expandedValues
        };
      });

    console.log('[tag-suggest] Generated suggestions:', processedTags);

    return new Response(
      JSON.stringify({ tags: processedTags }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[tag-suggest] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate tag suggestions' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

function buildTagSuggestionPrompt(): string {
  const frameworkOptions = TAG_DEFINITIONS
    .find(d => d.key === 'framework')
    ?.options?.map(o => `  - ${o.value}: ${o.description}`)
    .join('\n');

  const brandOptions = TAG_DEFINITIONS
    .find(d => d.key === 'design')
    ?.children?.find(c => c.key === 'brand')
    ?.options?.map(o => `  - ${o.value}: ${o.description}`)
    .join('\n');

  const styleOptions = TAG_DEFINITIONS
    .find(d => d.key === 'design')
    ?.children?.find(c => c.key === 'style')
    ?.options?.map(o => `  - ${o.value}: ${o.description}`)
    .join('\n');

  const headingFontOptions = TAG_DEFINITIONS
    .find(d => d.key === 'design')
    ?.children?.find(c => c.key === 'headingFont')
    ?.options?.map(o => `  - ${o.value}: ${o.description}`)
    .join('\n');

  const bodyFontOptions = TAG_DEFINITIONS
    .find(d => d.key === 'design')
    ?.children?.find(c => c.key === 'bodyFont')
    ?.options?.map(o => `  - ${o.value}: ${o.description}`)
    .join('\n');

  return `You are a tag suggestion expert for SentryVibe, a platform for building web applications.

Your job is to analyze a user's project description and suggest appropriate configuration tags.

## Available Tags:

### Framework (required - choose ONE):
${frameworkOptions}

### Brand (optional - choose ONE if appropriate):
${brandOptions}

### Typography (optional):
**Heading Fonts:**
${headingFontOptions}

**Body Fonts:**
${bodyFontOptions}

### Style (optional - choose UP TO 3 that work well together):
${styleOptions}

## Instructions:

1. Analyze the user's description for keywords and intent
2. Suggest 3-6 tags that best match their needs
3. ALWAYS suggest a framework tag
4. Consider brand tags if the description mentions error monitoring, payments, developer tools, etc.
5. Consider typography if specific aesthetic is mentioned
6. For style, choose 2-3 complementary styles (avoid conflicts like "minimal" + "bold")
7. Return ONLY a JSON array in this format:

[
  {
    "key": "framework",
    "value": "nextjs",
    "reasoning": "User mentioned dashboard which works well with Next.js SSR"
  },
  {
    "key": "brand",
    "value": "sentry",
    "reasoning": "Project is about error monitoring"
  },
  {
    "key": "headingFont",
    "value": "Poppins",
    "reasoning": "Friendly and approachable for consumer-facing app"
  },
  {
    "key": "bodyFont",
    "value": "Inter",
    "reasoning": "Excellent readability for dashboard data"
  },
  {
    "key": "style",
    "value": "modern",
    "reasoning": "Clean contemporary aesthetic"
  },
  {
    "key": "style",
    "value": "professional",
    "reasoning": "Polished feel for business tool"
  }
]

Do NOT include any other text or explanation - ONLY the JSON array.`;
}
