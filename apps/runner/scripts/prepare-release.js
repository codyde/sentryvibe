#!/usr/bin/env node
/**
 * Prepare package.json for publishing
 * Replaces file: dependencies with npm versions so the package can be installed globally
 * The vendor files are still included, and postinstall will replace npm versions with vendor versions
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '../package.json');

console.log('Preparing package.json for release...');

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const agentCorePackageJson = JSON.parse(
  readFileSync(join(__dirname, '../../../packages/agent-core/package.json'), 'utf-8'),
);

// Replace file: dependencies with npm versions
const replacements = {
  '@sentry/core': '^10.17.0',
  '@sentry/node': '^10.17.0',
  '@sentry/node-core': '^10.17.0',
  '@sentry/nextjs': '^10.17.0',
};

let modified = false;

for (const [pkg, version] of Object.entries(replacements)) {
  if (packageJson.dependencies[pkg] && packageJson.dependencies[pkg].startsWith('file:')) {
    console.log(`  Replacing ${pkg}: ${packageJson.dependencies[pkg]} → ${version}`);
    packageJson.dependencies[pkg] = version;
    modified = true;
  }
}

const agentCoreVersion = agentCorePackageJson.version;
const desiredAgentCoreVersion = `^${agentCoreVersion}`;
const currentAgentCore = packageJson.dependencies['@sentryvibe/agent-core'];

if (!currentAgentCore || currentAgentCore !== desiredAgentCoreVersion) {
  console.log(
    `  Setting @sentryvibe/agent-core: ${currentAgentCore ?? '<<missing>>'} → ${desiredAgentCoreVersion}`,
  );
  packageJson.dependencies['@sentryvibe/agent-core'] = desiredAgentCoreVersion;
  modified = true;
}

const existingBundled = new Set(packageJson.bundledDependencies ?? []);
if (!existingBundled.has('@sentryvibe/agent-core')) {
  existingBundled.add('@sentryvibe/agent-core');
  packageJson.bundledDependencies = Array.from(existingBundled);
  console.log('  Ensured @sentryvibe/agent-core is included in bundledDependencies');
  modified = true;
}

if (modified) {
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
  console.log('✓ package.json updated for release');
  console.log('');
  console.log('Note: This modifies package.json. After publishing, run:');
  console.log('  git checkout apps/runner/package.json');
  console.log('  to restore file: dependencies for local development');
} else {
  console.log('✓ package.json already has npm versions');
}
