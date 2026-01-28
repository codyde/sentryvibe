/**
 * Rollup configuration for @openbuilder/runner (lightweight runner package)
 *
 * This config bundles the runner functionality from @openbuilder/cli at build time,
 * so the published package is self-contained and doesn't require @openbuilder/cli at runtime.
 */
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import alias from '@rollup/plugin-alias';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// External dependencies - these won't be bundled
const external = [
  // Node.js built-ins
  'node:child_process',
  'node:crypto',
  'node:events',
  'node:fs',
  'node:fs/promises',
  'node:http',
  'node:https',
  'node:module',
  'node:net',
  'node:os',
  'node:path',
  'node:readline',
  'node:stream',
  'node:url',
  'node:util',
  // Also match without node: prefix
  'child_process',
  'crypto',
  'events',
  'fs',
  'fs/promises',
  'http',
  'https',
  'module',
  'net',
  'os',
  'path',
  'readline',
  'stream',
  'url',
  'util',

  // Vendor packages - BUNDLED (not external)
  // '@sentry/core',
  // '@sentry/node',
  // '@sentry/node-core',
  // 'ai-sdk-provider-claude-code',

  // NPM dependencies that are external
  '@ai-sdk/openai',
  '@anthropic-ai/claude-agent-sdk',
  '@openai/codex-sdk',
  'ai',
  'chalk',
  'commander',
  'conf',
  'dotenv',
  'express',
  // Bundle ink ecosystem with React
  // 'ink',
  // 'ink-select-input',
  // 'ink-spinner',
  // 'ink-text-input',
  'picocolors',
  // 'react',
  'ws',
  'zod',
];

// Check if a module should be external
function isExternal(id) {
  // Never externalize workspace packages - we bundle them
  if (id.startsWith('@openbuilder/')) return false;

  // Exact matches
  if (external.includes(id)) return true;

  // Match subpaths
  for (const ext of external) {
    if (id.startsWith(ext + '/')) return true;
  }

  return false;
}

const commonPlugins = [
  // Resolve workspace packages to their source
  alias({
    entries: [
      {
        find: '@openbuilder/cli',
        replacement: path.resolve(__dirname, '../../apps/runner/src'),
      },
      {
        find: '@openbuilder/agent-core',
        replacement: path.resolve(__dirname, '../agent-core/src'),
      },
      {
        find: '@openbuilder/agent-core/lib',
        replacement: path.resolve(__dirname, '../agent-core/src/lib'),
      },
    ],
  }),
  nodeResolve({
    preferBuiltins: true,
    exportConditions: ['node', 'import', 'default'],
  }),
  commonjs({
    transformMixedEsModules: true,
  }),
  typescript({
    tsconfig: './tsconfig.json',
    outputToFilesystem: true,
  }),
  json(),
];

// Banner for CJS compatibility shim
const cjsShimBanner = `// OpenBuilder Runner - Built with Rollup
import { createRequire as __createRequire } from 'node:module';
const require = __createRequire(import.meta.url);
`;

const defaultBanner = '// OpenBuilder Runner - Built with Rollup';

export default {
  input: {
    'index': 'src/index.ts',
    'cli': 'src/cli.ts',
    'instrument': 'src/instrument.ts',
  },
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: false, // No sourcemaps for smaller package size
    entryFileNames: '[name].js',
    chunkFileNames: 'chunks/[name]-[hash].js',
    banner: (chunk) => chunk.name === 'instrument' ? cjsShimBanner : defaultBanner,
  },
  external: isExternal,
  plugins: commonPlugins,
  onwarn(warning, warn) {
    // Ignore "this is undefined" warnings from @opentelemetry
    if (warning.code === 'THIS_IS_UNDEFINED' &&
        warning.id?.includes('@opentelemetry')) {
      return;
    }
    warn(warning);
  },
};
