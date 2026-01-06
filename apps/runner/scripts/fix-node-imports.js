#!/usr/bin/env node
/**
 * Post-build script to fix ESM compatibility issues:
 * 1. Ensure Node.js built-in imports use the node: protocol
 * 2. Replace the broken __require shim with one using createRequire
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST_DIR = new URL('../dist', import.meta.url).pathname;

// The broken __require shim pattern (matches the esbuild output)
const BROKEN_REQUIRE_PATTERN = /var __require = \/\* @__PURE__ \*\/ \(\(x\) => typeof require !== "undefined" \? require : typeof Proxy !== "undefined" \? new Proxy\(x, \{\s*get: \(a, b\) => \(typeof require !== "undefined" \? require : a\)\[b\]\s*\}\) : x\)\(function\(x\) \{\s*if \(typeof require !== "undefined"\) return require\.apply\(this, arguments\);\s*throw Error\('Dynamic require of "' \+ x \+ '" is not supported'\);\s*\}\);/g;

// Fixed shim using createRequire
const FIXED_REQUIRE_SHIM = `import { createRequire as __createRequire } from 'node:module';
var __require = __createRequire(import.meta.url);`;

// Node.js built-in modules
const BUILTINS = [
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'fs/promises',
  'http', 'http2', 'https', 'inspector', 'module', 'net', 'os', 'path',
  'perf_hooks', 'process', 'punycode', 'querystring', 'readline', 'repl',
  'stream', 'string_decoder', 'sys', 'timers', 'tls', 'trace_events',
  'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib'
];

// Create regex patterns for import styles that need node: prefix
function createPatterns() {
  const patterns = [];
  
  for (const builtin of BUILTINS) {
    const escaped = builtin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Static imports: from 'fs/promises' -> from 'node:fs/promises'
    patterns.push({
      regex: new RegExp(`(from\\s+['"])${escaped}(['"])`, 'g'),
      replacement: `$1node:${builtin}$2`
    });
    
    // Dynamic imports: import('fs/promises') -> import('node:fs/promises')
    patterns.push({
      regex: new RegExp(`(import\\s*\\(\\s*['"])${escaped}(['"]\\s*\\))`, 'g'),
      replacement: `$1node:${builtin}$2`
    });
  }
  
  return patterns;
}

async function processFile(filePath, patterns) {
  const content = await readFile(filePath, 'utf-8');
  let modified = content;
  let changeCount = 0;
  const fileName = filePath.split('/').pop();
  
  // Fix broken __require shim
  if (BROKEN_REQUIRE_PATTERN.test(modified)) {
    modified = modified.replace(BROKEN_REQUIRE_PATTERN, FIXED_REQUIRE_SHIM);
    console.log(`  Fixed __require shim in ${fileName}`);
    changeCount++;
  }
  
  // Fix Node.js built-in imports
  for (const { regex, replacement } of patterns) {
    const before = modified;
    modified = modified.replace(regex, replacement);
    if (modified !== before) {
      const matches = before.match(regex);
      changeCount += matches ? matches.length : 0;
    }
  }
  
  if (modified !== content) {
    await writeFile(filePath, modified, 'utf-8');
    if (changeCount > 1 || !content.includes('__require')) {
      console.log(`  Fixed ${changeCount} items in ${fileName}`);
    }
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
  console.log('Ensuring Node.js imports use node: protocol...');
  
  const patterns = createPatterns();
  const files = await getAllJsFiles(DIST_DIR);
  
  let totalChanges = 0;
  for (const file of files) {
    totalChanges += await processFile(file, patterns);
  }
  
  if (totalChanges > 0) {
    console.log(`Done! Fixed ${totalChanges} imports across ${files.length} files.`);
  } else {
    console.log('All imports already use node: protocol.');
  }
}

main().catch(err => {
  console.error('Error fixing imports:', err);
  process.exit(1);
});
