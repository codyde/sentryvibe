#!/usr/bin/env node
/**
 * Install vendor-patched Sentry packages that ship with the CLI bundle.
 * We unpack the tarballs that live in ./vendor into node_modules/@sentry/*
 * so the CLI always runs with the patched builds even when installed offline.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, lstatSync, readlinkSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.join(__dirname, '..');
const vendorDir = path.join(packageRoot, 'vendor');

// Detect the correct node_modules location for both npm and pnpm
// The vendor packages MUST be installed in the same node_modules tree as the CLI
// to ensure proper Node.js module resolution. npm may create empty placeholder directories
// in nested node_modules, so we need to install there to override them.
function findNodeModules() {
  // Local node_modules inside the package (npm style for bundled deps)
  const localNodeModules = path.join(packageRoot, 'node_modules');

  // Parent node_modules (pnpm global style: @shipbuilder/cli -> @shipbuilder -> node_modules)
  const parentNodeModules = path.join(packageRoot, '..', '..');

  // Always prefer local node_modules if it exists - this ensures vendor packages
  // are in the same resolution tree as the CLI package
  if (existsSync(localNodeModules)) {
    return localNodeModules;
  }

  // Fall back to parent for pnpm global installs where there's no local node_modules
  if (existsSync(path.join(parentNodeModules, '@shipbuilder')) ||
      existsSync(path.join(parentNodeModules, '@sentry'))) {
    return parentNodeModules;
  }

  // Default to local (will be created)
  return localNodeModules;
}

const nodeModules = findNodeModules();

const packages = [
  { name: 'core', tarball: 'sentry-core-LOCAL.tgz', scope: '@sentry' },
  { name: 'node', tarball: 'sentry-node-LOCAL.tgz', scope: '@sentry' },
  { name: 'node-core', tarball: 'sentry-node-core-LOCAL.tgz', scope: '@sentry' },
  { name: 'nextjs', tarball: 'sentry-nextjs-LOCAL.tgz', scope: '@sentry' },
  { name: 'ai-sdk-provider-claude-code', tarball: 'ai-sdk-provider-claude-code-LOCAL.tgz', scope: '' }, // No scope for this package
];

// Silent mode by default, only show output if VERBOSE env var is set
const isVerbose = process.env.VERBOSE === '1' || process.env.VERBOSE === 'true';
const log = isVerbose ? console.log : () => {};

log('Installing vendor Sentry packages...');
log(`  Vendor directory: ${vendorDir}`);
log(`  Target node_modules: ${nodeModules}`);

if (!existsSync(vendorDir)) {
  log('No vendor directory found, skipping...');
  process.exit(0);
}

const missing = packages.filter(
  ({ tarball }) => !existsSync(path.join(vendorDir, tarball)),
);

if (missing.length) {
  log(
    `Vendor tarballs not found for: ${missing
      .map(({ tarball }) => tarball)
      .join(', ')}, skipping...`,
  );
  process.exit(0);
}

try {
  mkdirSync(nodeModules, { recursive: true });
  mkdirSync(path.join(nodeModules, '@sentry'), { recursive: true });

  for (const { name, tarball, scope } of packages) {
    const source = path.join(vendorDir, tarball);
    const destination = scope
      ? path.join(nodeModules, scope, name)
      : path.join(nodeModules, name);
    const extractTarget = resolveExtractionTarget(destination);

    execFileSync(
      'tar',
      ['-xzf', source, '--strip-components', '1', '-C', extractTarget],
      { stdio: 'pipe' },
    );

    log(`  ✓ ${scope ? `${scope}/${name}` : name}`);
  }

  // Ensure jsonc-parser is available for ai-sdk-provider-claude-code
  // This is needed because the vendored package imports it but in global installs
  // with pnpm, the dependency hoisting doesn't always work correctly
  const aiSdkProviderDir = path.join(nodeModules, 'ai-sdk-provider-claude-code');

  if (existsSync(aiSdkProviderDir)) {
    try {
      // Try to find jsonc-parser in various locations
      let jsoncParserSource = path.join(nodeModules, 'jsonc-parser');

      // If not found directly, try to find it in the pnpm store (for global installs)
      if (!existsSync(jsoncParserSource)) {
        // In pnpm global installs, node_modules is at .pnpm/<package>@<version>/node_modules
        // The store is at .pnpm/ level, so we need to go up: node_modules -> <package> -> .pnpm
        const pnpmStoreDir = path.join(nodeModules, '..', '..');

        if (existsSync(pnpmStoreDir)) {
          const entries = readdirSync(pnpmStoreDir);
          const jsoncParserEntry = entries.find((entry) => entry.startsWith('jsonc-parser@'));

          if (jsoncParserEntry) {
            jsoncParserSource = path.join(pnpmStoreDir, jsoncParserEntry, 'node_modules', 'jsonc-parser');
          }
        }
      }

      if (existsSync(jsoncParserSource)) {
        const jsoncParserDest = path.join(aiSdkProviderDir, 'node_modules', 'jsonc-parser');

        mkdirSync(path.join(aiSdkProviderDir, 'node_modules'), { recursive: true });

        // Remove existing symlink/directory if it exists
        rmSync(jsoncParserDest, { recursive: true, force: true });

        // Create symlink to jsonc-parser
        execFileSync('ln', ['-s', jsoncParserSource, jsoncParserDest], { stdio: 'pipe' });

        log(`  ✓ Linked jsonc-parser for ai-sdk-provider-claude-code`);
      } else {
        log(`  ⚠ jsonc-parser not found, skipping symlink`);
      }
    } catch (error) {
      // Non-fatal error, log and continue
      log(`  ⚠ Could not link jsonc-parser: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  log('✓ Vendor packages installed successfully');
} catch (error) {
  console.warn('Warning: Could not install vendor packages, using published versions');
  console.warn(error instanceof Error ? error.message : String(error));
}

function resolveExtractionTarget(destination) {
  try {
    const stat = lstatSync(destination);
    if (stat.isSymbolicLink()) {
      const linkTarget = readlinkSync(destination);
      return path.resolve(path.dirname(destination), linkTarget);
    }
  } catch (error) {
    // Path does not exist yet.
  }

  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  return destination;
}
