#!/usr/bin/env node
/**
 * Post-build script to fix Node.js built-in imports
 * 
 * ESM requires the node: protocol prefix for built-in modules to avoid
 * "Dynamic require of X is not supported" errors.
 * 
 * This script rewrites all bare imports of Node.js built-ins to use the node: prefix.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST_DIR = new URL('../dist', import.meta.url).pathname;

// Node.js built-in modules that need the node: prefix
const BUILTINS = [
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'fs/promises',
  'http', 'http2', 'https', 'inspector', 'module', 'net', 'os', 'path',
  'perf_hooks', 'process', 'punycode', 'querystring', 'readline', 'repl',
  'stream', 'string_decoder', 'sys', 'timers', 'tls', 'trace_events',
  'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib'
];

// Create regex patterns for different import styles
function createPatterns() {
  const patterns = [];
  
  for (const builtin of BUILTINS) {
    // Escape special regex characters in module name
    const escaped = builtin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Static imports: import { x } from 'fs/promises'
    patterns.push({
      regex: new RegExp(`(from\\s+['"])${escaped}(['"])`, 'g'),
      replacement: `$1node:${builtin}$2`
    });
    
    // Dynamic imports: await import('fs/promises')
    patterns.push({
      regex: new RegExp(`(import\\s*\\(\\s*['"])${escaped}(['"]\\s*\\))`, 'g'),
      replacement: `$1node:${builtin}$2`
    });
    
    // require calls: require("fs/promises")
    patterns.push({
      regex: new RegExp(`(__require\\s*\\(\\s*['"])${escaped}(['"]\\s*\\))`, 'g'),
      replacement: `$1node:${builtin}$2`
    });
    
    // Also handle bare require
    patterns.push({
      regex: new RegExp(`(require\\s*\\(\\s*['"])${escaped}(['"]\\s*\\))`, 'g'),
      replacement: `$1node:${builtin}$2`
    });
  }
  
  return patterns;
}

async function processFile(filePath, patterns) {
  const content = await readFile(filePath, 'utf-8');
  let modified = content;
  let changeCount = 0;
  
  for (const { regex, replacement } of patterns) {
    const newContent = modified.replace(regex, (match, ...args) => {
      // Don't replace if already has node: prefix
      if (match.includes('node:')) {
        return match;
      }
      changeCount++;
      return match.replace(regex, replacement);
    });
    modified = newContent;
  }
  
  if (changeCount > 0) {
    await writeFile(filePath, modified, 'utf-8');
    console.log(`  Fixed ${changeCount} imports in ${filePath.split('/').pop()}`);
  }
  
  return changeCount;
}

async function getAllJsFiles(dir) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await getAllJsFiles(fullPath));
    } else if (entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

async function main() {
  console.log('Fixing Node.js built-in imports in dist/...');
  
  const patterns = createPatterns();
  const files = await getAllJsFiles(DIST_DIR);
  
  let totalChanges = 0;
  for (const file of files) {
    totalChanges += await processFile(file, patterns);
  }
  
  console.log(`Done! Fixed ${totalChanges} imports across ${files.length} files.`);
}

main().catch(err => {
  console.error('Error fixing imports:', err);
  process.exit(1);
});
