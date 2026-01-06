import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'cli/index': 'src/cli/index.ts',
    'instrument': 'src/instrument.ts',
  },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  splitting: true,
  sourcemap: true,
  clean: true,
  dts: false,
  
  // Bundle @sentryvibe/agent-core into the output
  // agent-core is now ESM, so bundling works cleanly without CJS shims
  noExternal: [
    '@sentryvibe/agent-core',
  ],
  
  // Keep all other dependencies external - they'll be installed from npm
  external: [
    // Node.js built-ins (use node: protocol for ESM)
    /^node:/,
    
    // Vendor packages (installed from local tarballs)
    '@sentry/core',
    '@sentry/node',
    '@sentry/node-core', 
    '@sentry/nextjs',
    'ai-sdk-provider-claude-code',
    
    // NPM packages
    '@ai-sdk/openai',
    '@anthropic-ai/claude-agent-sdk',
    '@clack/prompts',
    '@openai/codex-sdk',
    'ai',
    'better-auth',
    'chalk',
    'clsx',
    'commander',
    'conf',
    'dotenv',
    'drizzle-orm',
    'express',
    'http-proxy',
    'ink',
    'ink-select-input',
    'ink-spinner',
    'ink-text-input',
    'inquirer',
    'jsonc-parser',
    'lucide-react',
    'ora',
    'pg',
    'picocolors',
    'react',
    'server-only',
    'simple-git',
    'tailwind-merge',
    'update-notifier',
    'ws',
    'zod',
    'zod-to-json-schema',
  ],
  
  treeshake: true,
  
  banner: {
    js: '// SentryVibe Runner CLI - @sentryvibe/agent-core bundled as ESM',
  },
});
