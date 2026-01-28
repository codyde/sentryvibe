#!/usr/bin/env node
/**
 * Install vendor-patched Sentry packages that ship with the runner bundle.
 * We unpack the tarballs that live in ./vendor into node_modules/@sentry/*
 * so the runner always runs with the patched builds even when installed offline.
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
function findNodeModules() {
  // Local node_modules inside the package (npm style for bundled deps)
  const localNodeModules = path.join(packageRoot, 'node_modules');

  // Parent node_modules (pnpm global style)
  const parentNodeModules = path.join(packageRoot, '..', '..');

  // Always prefer local node_modules if it exists
  if (existsSync(localNodeModules)) {
    return localNodeModules;
  }

  // Fall back to parent for pnpm global installs
  if (existsSync(path.join(parentNodeModules, '@openbuilder')) ||
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
  { name: 'ai-sdk-provider-claude-code', tarball: 'ai-sdk-provider-claude-code-LOCAL.tgz', scope: '' },
];

// Silent mode by default
const isVerbose = process.env.VERBOSE === '1' || process.env.VERBOSE === 'true';
const log = isVerbose ? console.log : () => {};

log('Installing vendor packages...');
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

    log(`  ${scope ? `${scope}/${name}` : name}`);
  }

  // Ensure jsonc-parser is available for ai-sdk-provider-claude-code
  const aiSdkProviderDir = path.join(nodeModules, 'ai-sdk-provider-claude-code');

  if (existsSync(aiSdkProviderDir)) {
    try {
      let jsoncParserSource = path.join(nodeModules, 'jsonc-parser');

      if (!existsSync(jsoncParserSource)) {
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
        rmSync(jsoncParserDest, { recursive: true, force: true });
        execFileSync('ln', ['-s', jsoncParserSource, jsoncParserDest], { stdio: 'pipe' });

        log(`  Linked jsonc-parser for ai-sdk-provider-claude-code`);
      } else {
        log(`  jsonc-parser not found, skipping symlink`);
      }
    } catch (error) {
      log(`  Could not link jsonc-parser: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  log('Vendor packages installed successfully');
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
