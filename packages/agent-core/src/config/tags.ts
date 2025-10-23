/**
 * Tag Configuration
 *
 * This file defines all available tags for configuring builds.
 * Tags are organized into categories and can be nested for complex configurations.
 */

export interface TagOption {
  value: string;
  label: string;
  description?: string;
  // For theme/brand tags - bundle of values that get expanded
  values?: Record<string, string>;
}

export interface TagDefinition {
  key: string;
  label: string;
  description: string;
  category: 'model' | 'framework' | 'design' | 'runner';
  inputType: 'select' | 'color' | 'nested';
  options?: TagOption[];
  // For nested tags like "design" -> "primaryColor"
  children?: TagDefinition[];
  // How this tag's value gets injected into AI prompt
  promptTemplate?: string;
}

export const TAG_DEFINITIONS: TagDefinition[] = [
  // Model Selection (agent + model combined)
  {
    key: 'model',
    label: 'Model',
    description: 'AI agent and model to use for generation',
    category: 'model',
    inputType: 'select',
    options: [
      {
        value: 'claude-sonnet-4.5',
        label: 'Claude Sonnet 4.5',
        description: 'Anthropic Claude - Balanced performance and speed'
      },
      {
        value: 'claude-opus-4',
        label: 'Claude Opus 4',
        description: 'Anthropic Claude - Most capable, slower'
      },
      {
        value: 'claude-haiku-4.5',
        label: 'Claude Haiku 4.5',
        description: 'Anthropic Claude - Fastest, good for iterations'
      },
      {
        value: 'openai-gpt-5-codex',
        label: 'GPT-5 Codex',
        description: 'OpenAI Codex - Advanced code generation'
      }
    ]
  },

  // Framework Selection
  {
    key: 'framework',
    label: 'Framework',
    description: 'Frontend framework to use',
    category: 'framework',
    inputType: 'select',
    options: [
      {
        value: 'nextjs',
        label: 'Next.js',
        description: 'React with SSR and file-based routing'
      },
      {
        value: 'astro',
        label: 'Astro',
        description: 'Content-focused with islands architecture'
      },
      {
        value: 'react',
        label: 'React',
        description: 'Component library for SPAs'
      },
      {
        value: 'vue',
        label: 'Vue',
        description: 'Progressive framework'
      }
    ],
    promptTemplate: 'Use {value} as the framework for this project. Set up the project structure according to {value} best practices.'
  },

  // Runner Selection (options populated dynamically)
  {
    key: 'runner',
    label: 'Runner',
    description: 'Build runner to execute the build',
    category: 'runner',
    inputType: 'select',
    options: [] // Populated dynamically from connected runners
  },

  // Design Configuration (nested)
  {
    key: 'design',
    label: 'Design',
    description: 'Visual design preferences',
    category: 'design',
    inputType: 'nested',
    children: [
      // Brand Themes
      {
        key: 'brand',
        label: 'Brand',
        description: 'Pre-configured brand color themes',
        category: 'design',
        inputType: 'select',
        options: [
          {
            value: 'stripe',
            label: 'Stripe',
            description: 'Modern payments aesthetic',
            values: {
              primaryColor: '#635bff',
              secondaryColor: '#0a2540',
              accentColor: '#00d4ff',
              neutralLight: '#f6f9fc',
              neutralDark: '#0a2540'
            }
          },
          {
            value: 'vercel',
            label: 'Vercel',
            description: 'Clean developer tools',
            values: {
              primaryColor: '#000000',
              secondaryColor: '#ffffff',
              accentColor: '#0070f3',
              neutralLight: '#fafafa',
              neutralDark: '#000000'
            }
          },
          {
            value: 'linear',
            label: 'Linear',
            description: 'Sleek project management',
            values: {
              primaryColor: '#5e6ad2',
              secondaryColor: '#26b5ce',
              accentColor: '#f2994a',
              neutralLight: '#f7f8f8',
              neutralDark: '#1a1a1a'
            }
          },
          {
            value: 'notion',
            label: 'Notion',
            description: 'Warm productivity',
            values: {
              primaryColor: '#2383e2',
              secondaryColor: '#e69138',
              accentColor: '#d44c47',
              neutralLight: '#f7f6f3',
              neutralDark: '#37352f'
            }
          },
          {
            value: 'github',
            label: 'GitHub',
            description: 'Developer-first',
            values: {
              primaryColor: '#238636',
              secondaryColor: '#1f6feb',
              accentColor: '#f85149',
              neutralLight: '#f6f8fa',
              neutralDark: '#24292f'
            }
          },
          {
            value: 'airbnb',
            label: 'Airbnb',
            description: 'Friendly travel',
            values: {
              primaryColor: '#ff385c',
              secondaryColor: '#00a699',
              accentColor: '#fc642d',
              neutralLight: '#f7f7f7',
              neutralDark: '#222222'
            }
          },
          {
            value: 'spotify',
            label: 'Spotify',
            description: 'Bold music streaming',
            values: {
              primaryColor: '#1db954',
              secondaryColor: '#191414',
              accentColor: '#1ed760',
              neutralLight: '#f6f6f6',
              neutralDark: '#000000'
            }
          }
        ],
        promptTemplate: 'Use the {value} brand aesthetic with the following color palette: Primary: {primaryColor}, Secondary: {secondaryColor}, Accent: {accentColor}, Neutral Light: {neutralLight}, Neutral Dark: {neutralDark}. Match the design style and feel of {value}.'
      },

      // Individual Color Overrides
      {
        key: 'primaryColor',
        label: 'Primary Color',
        description: 'Main brand color for CTAs and primary actions',
        category: 'design',
        inputType: 'color',
        promptTemplate: 'Use {value} as the primary color for CTAs, buttons, and brand elements. This is the main brand color.'
      },
      {
        key: 'secondaryColor',
        label: 'Secondary Color',
        description: 'Supporting color for secondary elements',
        category: 'design',
        inputType: 'color',
        promptTemplate: 'Use {value} as the secondary color for supporting elements and secondary actions.'
      },
      {
        key: 'accentColor',
        label: 'Accent Color',
        description: 'Highlight color for emphasis',
        category: 'design',
        inputType: 'color',
        promptTemplate: 'Use {value} as the accent color for highlights, badges, and emphasis elements.'
      },
      {
        key: 'neutralLight',
        label: 'Neutral Light',
        description: 'Light background and surface color',
        category: 'design',
        inputType: 'color',
        promptTemplate: 'Use {value} as the light neutral color for backgrounds and surfaces in light mode.'
      },
      {
        key: 'neutralDark',
        label: 'Neutral Dark',
        description: 'Dark text and border color',
        category: 'design',
        inputType: 'color',
        promptTemplate: 'Use {value} as the dark neutral color for text, borders, and dark mode backgrounds.'
      },

      // Style/Mood Selection
      {
        key: 'style',
        label: 'Style',
        description: 'Visual style and design aesthetic',
        category: 'design',
        inputType: 'select',
        options: [
          {
            value: 'modern',
            label: 'Modern',
            description: 'Clean lines, contemporary patterns, ample white space'
          },
          {
            value: 'minimal',
            label: 'Minimal',
            description: 'Essential elements only, generous spacing, restrained palette'
          },
          {
            value: 'professional',
            label: 'Professional',
            description: 'Polished, consistent, attention to detail'
          },
          {
            value: 'bold',
            label: 'Bold',
            description: 'Strong contrasts, large typography, confident statements'
          },
          {
            value: 'elegant',
            label: 'Elegant',
            description: 'Refined details, subtle transitions, sophisticated spacing'
          },
          {
            value: 'playful',
            label: 'Playful',
            description: 'Rounded shapes, friendly interactions, lighthearted touches'
          },
          {
            value: 'luxurious',
            label: 'Luxurious',
            description: 'Premium feel, refined details, sophisticated presentation'
          },
          {
            value: 'trustworthy',
            label: 'Trustworthy',
            description: 'Clear hierarchy, readable typography, familiar patterns'
          },
          {
            value: 'friendly',
            label: 'Friendly',
            description: 'Approachable, warm colors, inviting interactions'
          },
          {
            value: 'energetic',
            label: 'Energetic',
            description: 'Vibrant colors, dynamic layouts, active feeling'
          },
          {
            value: 'clean',
            label: 'Clean',
            description: 'Uncluttered, focused, clear visual hierarchy'
          },
          {
            value: 'sophisticated',
            label: 'Sophisticated',
            description: 'Refined aesthetics, balanced composition, mature style'
          },
          {
            value: 'vibrant',
            label: 'Vibrant',
            description: 'Rich colors, high energy, lively presence'
          },
          {
            value: 'warm',
            label: 'Warm',
            description: 'Inviting colors, soft edges, approachable feel'
          },
          {
            value: 'tech-forward',
            label: 'Tech-Forward',
            description: 'Sharp edges, monospace accents, futuristic elements'
          }
        ],
        promptTemplate: 'Design should feel {value}. Apply this aesthetic through typography, spacing, component design, and overall visual treatment. {value} means: {description}.'
      }
    ]
  }
];

/**
 * Find a tag definition by key
 */
export function findTagDefinition(key: string): TagDefinition | undefined {
  for (const def of TAG_DEFINITIONS) {
    if (def.key === key) return def;
    if (def.children) {
      const child = def.children.find(c => c.key === key);
      if (child) return child;
    }
  }
  return undefined;
}

/**
 * Get all available tag keys (flattened)
 */
export function getAllTagKeys(): string[] {
  const keys: string[] = [];
  for (const def of TAG_DEFINITIONS) {
    keys.push(def.key);
    if (def.children) {
      keys.push(...def.children.map(c => c.key));
    }
  }
  return keys;
}

/**
 * Get tag definitions by category
 */
export function getTagsByCategory(category: TagDefinition['category']): TagDefinition[] {
  return TAG_DEFINITIONS.filter(def => def.category === category);
}
