#!/usr/bin/env node
/**
 * Prepare package.json for publishing
 * 
 * This script:
 * 1. Replaces file: dependencies with npm versions (for Sentry/vendor packages)
 * 2. REMOVES @sentryvibe/agent-core from dependencies (it's bundled by tsup)
 * 
 * The vendor files are still included, and postinstall will replace npm versions with vendor versions
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '../package.json');

console.log('Preparing package.json for release...');
console.log('');

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

// Replace file: dependencies with npm versions
const replacements = {
  '@sentry/core': '^10.17.0',
  '@sentry/node': '^10.17.0',
  '@sentry/node-core': '^10.17.0',
  '@sentry/nextjs': '^10.17.0',
  'ai-sdk-provider-claude-code': '^2.1.0', // Use npm version, postinstall will replace with vendor
};

let modified = false;

for (const [pkg, version] of Object.entries(replacements)) {
  if (packageJson.dependencies[pkg] && packageJson.dependencies[pkg].startsWith('file:')) {
    console.log(`  Replacing ${pkg}: ${packageJson.dependencies[pkg]} → ${version}`);
    packageJson.dependencies[pkg] = version;
    modified = true;
  }
}

// REMOVE workspace dependencies - they're bundled into dist/ by rollup
// This eliminates npm 404 errors since these packages don't exist on npm
const workspaceDeps = ['@sentryvibe/agent-core', '@sentryvibe/opencode-client'];
for (const dep of workspaceDeps) {
  if (packageJson.dependencies[dep]) {
    console.log(`  Removing ${dep} (bundled by rollup)`);
    delete packageJson.dependencies[dep];
    modified = true;
  }
}

// Remove bundledDependencies if it exists (no longer needed)
if (packageJson.bundledDependencies) {
  console.log(`  Removing bundledDependencies (agent-core is inlined, not bundled)`);
  delete packageJson.bundledDependencies;
  modified = true;
}

if (modified) {
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
  console.log('');
  console.log('✓ package.json updated for release');
  console.log('');
  console.log('Note: This modifies package.json. After publishing, run:');
  console.log('  git checkout apps/runner/package.json');
  console.log('  to restore workspace:* dependency for local development');
} else {
  console.log('✓ package.json already prepared for release');
}
