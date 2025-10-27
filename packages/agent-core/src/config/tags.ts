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
  // For brand tags - logo path
  logo?: string;
  // For model tags - provider and model mapping
  provider?: string;
  model?: string;
  // For framework tags - template repository information
  repository?: string;
  branch?: string;
}

export interface TagDefinition {
  key: string;
  label: string;
  description: string;
  category: 'model' | 'framework' | 'design' | 'runner';
  inputType: 'select' | 'color' | 'nested' | 'multi-select';
  options?: TagOption[];
  // For nested tags like "design" -> "primaryColor"
  children?: TagDefinition[];
  // How this tag's value gets injected into AI prompt
  promptTemplate?: string;
  // Allow multiple instances of this tag
  allowMultiple?: boolean;
  // Maximum number of selections (for multi-select)
  maxSelections?: number;
}

export const TAG_DEFINITIONS: TagDefinition[] = [
  // Model Selection (explicit provider + model mapping)
  {
    key: 'model',
    label: 'Model',
    description: 'AI agent and model to use for generation',
    category: 'model',
    inputType: 'select',
    options: [
      {
        value: 'claude-sonnet-4-5',
        label: 'Claude Sonnet 4.5',
        description: 'Anthropic Claude - Balanced performance and speed',
        logo: '/claude.png',
        provider: 'claude-code',
        model: 'claude-sonnet-4-5'
      },
      {
        value: 'claude-haiku-4-5',
        label: 'Claude Haiku 4.5',
        description: 'Anthropic Claude - Fastest, good for iterations',
        logo: '/claude.png',
        provider: 'claude-code',
        model: 'claude-haiku-4-5'
      },
      {
        value: 'gpt-5-codex',
        label: 'GPT-5 Codex',
        description: 'OpenAI Codex - Advanced code generation',
        logo: '/openai.png',
        provider: 'openai-codex',
        model: 'gpt-5-codex'
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
        value: 'next',
        label: 'Next.js',
        description: 'Full-stack React with SSR, App Router, and file-based routing',
        logo: '/nextjs.png',
        repository: 'github:codyde/template-nextjs15',
        branch: 'main'
      },
      {
        value: 'vite',
        label: 'React + Vite',
        description: 'Fast React SPA with Vite - perfect for client-side apps',
        logo: '/reactjs.png',
        repository: 'github:codyde/template-reactvite',
        branch: 'main'
      },
      {
        value: 'astro',
        label: 'Astro',
        description: 'Content-focused static sites with islands architecture',
        logo: '/astro.png',
        repository: 'github:codyde/template-astro',
        branch: 'main'
      }
    ],
    promptTemplate: 'CRITICAL: You MUST use the {label} template. Clone it using: npx degit {repository}#{branch} {{projectName}}'
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
        maxSelections: 1,
        options: [
          {
            value: 'sentry',
            label: 'Sentry',
            description: 'Error monitoring and performance - vibrant purple and pink',
            logo: '/logos/sentry.svg',
            values: {
              primaryColor: '#9D58BF',
              secondaryColor: '#FF708C',
              accentColor: '#FF9838',
              neutralLight: '#F0ECF3',
              neutralDark: '#2B2233'
            }
          },
          {
            value: 'stripe',
            label: 'Stripe',
            description: 'Modern payments aesthetic',
            logo: '/logos/stripe.svg',
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
            logo: '/logos/vercel.svg',
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
            logo: '/logos/linear.svg',
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
            logo: '/logos/notion.svg',
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
            logo: '/logos/github.svg',
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
            logo: '/logos/airbnb.svg',
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
            logo: '/logos/spotify.svg',
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

      // Style/Mood Selection
      {
        key: 'style',
        label: 'Style',
        description: 'Visual style and design aesthetic (select up to 3)',
        category: 'design',
        inputType: 'select',
        allowMultiple: true,
        maxSelections: 3,
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
        promptTemplate: 'Design should feel {values}. Apply these aesthetics through typography, spacing, component design, and overall visual treatment.'
      },

      // Customize (nested group for colors and fonts)
      {
        key: 'customize',
        label: 'Customize',
        description: 'Fine-tune colors and typography',
        category: 'design',
        inputType: 'nested',
        children: [
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

          // Typography
          {
            key: 'headingFont',
            label: 'Heading Font',
            description: 'Font family for headings (h1-h6)',
            category: 'design',
            inputType: 'select',
            maxSelections: 1,
            options: [
              { value: 'Inter', label: 'Inter', description: 'Clean, modern sans-serif - excellent readability' },
              { value: 'Poppins', label: 'Poppins', description: 'Geometric sans-serif - friendly and approachable' },
              { value: 'Montserrat', label: 'Montserrat', description: 'Urban sans-serif - professional and bold' },
              { value: 'Space Grotesk', label: 'Space Grotesk', description: 'Tech-forward sans-serif - modern and unique' },
              { value: 'Playfair Display', label: 'Playfair Display', description: 'Elegant serif - sophisticated and refined' },
              { value: 'Merriweather', label: 'Merriweather', description: 'Classic serif - readable and trustworthy' },
              { value: 'Lexend', label: 'Lexend', description: 'Highly legible sans-serif - accessibility focused' },
              { value: 'DM Sans', label: 'DM Sans', description: 'Low-contrast sans-serif - clean and minimal' }
            ],
            promptTemplate: 'Use {value} as the heading font for all h1, h2, h3, h4, h5, h6 elements. Import from Google Fonts.'
          },
          {
            key: 'bodyFont',
            label: 'Body Font',
            description: 'Font family for body text and UI elements',
            category: 'design',
            inputType: 'select',
            maxSelections: 1,
            options: [
              { value: 'System UI', label: 'System UI', description: 'Native system fonts - fast and familiar' },
              { value: 'Inter', label: 'Inter', description: 'Clean, modern sans-serif - excellent readability' },
              { value: 'Open Sans', label: 'Open Sans', description: 'Friendly humanist sans-serif - highly readable' },
              { value: 'Roboto', label: 'Roboto', description: 'Neo-grotesque sans-serif - clean and neutral' },
              { value: 'Work Sans', label: 'Work Sans', description: 'Optimized for screen - clear and legible' },
              { value: 'Lato', label: 'Lato', description: 'Warm sans-serif - friendly and professional' },
              { value: 'Source Sans 3', label: 'Source Sans 3', description: 'Adobe sans-serif - clean and technical' }
            ],
            promptTemplate: 'Use {value} as the body font for all paragraphs, labels, buttons, and UI text. Import from Google Fonts if not a system font.'
          }
        ]
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
