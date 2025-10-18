#!/usr/bin/env node
/**
 * Install vendor-patched Sentry packages that ship with the CLI bundle.
 * We unpack the tarballs that live in ./vendor into node_modules/@sentry/*
 * so the CLI always runs with the patched builds even when installed offline.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, lstatSync, readlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.join(__dirname, '..');
const vendorDir = path.join(packageRoot, 'vendor');
const nodeModules = path.join(packageRoot, 'node_modules');

const packages = [
  { name: 'core', tarball: 'sentry-core-LOCAL.tgz' },
  { name: 'node', tarball: 'sentry-node-LOCAL.tgz' },
  { name: 'node-core', tarball: 'sentry-node-core-LOCAL.tgz' },
  { name: 'nextjs', tarball: 'sentry-nextjs-LOCAL.tgz' },
];

console.log('Installing vendor Sentry packages...');

if (!existsSync(vendorDir)) {
  console.log('No vendor directory found, skipping...');
  process.exit(0);
}

const missing = packages.filter(
  ({ tarball }) => !existsSync(path.join(vendorDir, tarball)),
);

if (missing.length) {
  console.log(
    `Vendor tarballs not found for: ${missing
      .map(({ tarball }) => tarball)
      .join(', ')}, skipping...`,
  );
  process.exit(0);
}

try {
  mkdirSync(nodeModules, { recursive: true });
  mkdirSync(path.join(nodeModules, '@sentry'), { recursive: true });
  mkdirSync(path.join(nodeModules, '@sentryvibe'), { recursive: true });

  for (const { name, tarball } of packages) {
    const source = path.join(vendorDir, tarball);
    const destination = path.join(nodeModules, '@sentry', name);
    const extractTarget = resolveExtractionTarget(destination);

    execFileSync(
      'tar',
      ['-xzf', source, '--strip-components', '1', '-C', extractTarget],
      { stdio: 'pipe' },
    );

    console.log(`  ✓ @sentry/${name}`);
  }

  // Also install agent-core from vendor if present
  const agentCoreTarball = path.join(vendorDir, 'sentryvibe-agent-core-0.1.0.tgz');
  if (existsSync(agentCoreTarball)) {
    const agentCoreDestination = path.join(nodeModules, '@sentryvibe', 'agent-core');
    const agentCoreExtractTarget = resolveExtractionTarget(agentCoreDestination);

    execFileSync(
      'tar',
      ['-xzf', agentCoreTarball, '--strip-components', '1', '-C', agentCoreExtractTarget],
      { stdio: 'pipe' },
    );

    console.log(`  ✓ @sentryvibe/agent-core`);
  }

  console.log('✓ Vendor packages installed successfully');
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
