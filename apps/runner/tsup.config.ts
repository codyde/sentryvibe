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
  splitting: true, // Allow code splitting for shared chunks
  sourcemap: true,
  clean: true,
  dts: false, // No need for declaration files in CLI distribution
  
  // Bundle @sentryvibe/agent-core into the output
  // This eliminates the npm dependency that doesn't exist
  noExternal: [
    '@sentryvibe/agent-core',
  ],
  
  // Keep all other dependencies external - they'll be installed from npm
  external: [
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
    'chalk',
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
    'ora',
    'pg',
    'picocolors',
    'react',
    'simple-git',
    'update-notifier',
    'ws',
    'zod',
    'zod-to-json-schema',
    
    // Node built-ins are handled by the plugin above
  ],
  
  // Handle dynamic imports properly
  treeshake: true,
  
  // Banner to preserve shebang for CLI
  banner: {
    js: '// Bundled with tsup - @sentryvibe/agent-core is inlined',
  },
  
  esbuildOptions(options) {
    // Ensure proper handling of __dirname/__filename in ESM
    options.define = {
      ...options.define,
    };
  },
});
