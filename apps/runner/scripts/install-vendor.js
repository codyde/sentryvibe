#!/usr/bin/env node
/**
 * Install vendor-patched Sentry packages that ship with the CLI bundle.
 * We unpack the tarballs that live in ./vendor into node_modules/@sentry/*
 * so the CLI always runs with the patched builds even when installed offline.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageRoot = path.join(__dirname, '..');
const vendorDir = path.join(packageRoot, 'vendor');
const nodeModules = path.join(packageRoot, 'node_modules');

const packages = [
  // { name: 'node', tarball: 'sentry-node-10.17.0.tgz' },
  // { name: 'nextjs', tarball: 'sentry-nextjs-10.17.0.tgz' },
  // { name: 'core', tarball: 'sentry-core-10.17.0.tgz' },
  // { name: 'node-core', tarball: 'sentry-node-core-10.17.0.tgz' },
  // { name: 'opentelemetry', tarball: 'sentry-opentelemetry-10.17.0.tgz' },
  { name: 'core', tarball: 'sentry-core-LOCAL.tgz' },
  { name: 'node', tarball: 'sentry-node-LOCAL.tgz' },
  { name: 'node-core', tarball: 'sentry-node-core-LOCAL.tgz' },
  { name: 'nextjs', tarball: 'sentry-nextjs-LOCAL.tgz' },
  { name: 'opentelemetry', tarball: 'sentry-opentelemetry-LOCAL.tgz' },
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

  for (const { name, tarball } of packages) {
    const source = path.join(vendorDir, tarball);
    const destination = path.join(nodeModules, '@sentry', name);

    // Replace any existing installation to guarantee the patched build is used.
    rmSync(destination, { recursive: true, force: true });
    mkdirSync(destination, { recursive: true });

    execFileSync(
      'tar',
      ['-xzf', source, '--strip-components', '1', '-C', destination],
      { stdio: 'pipe' },
    );

    console.log(`  ✓ @sentry/${name}`);
  }

  console.log('✓ Vendor packages installed successfully');
} catch (error) {
  console.warn('Warning: Could not install vendor packages, using published versions');
  console.warn(error instanceof Error ? error.message : String(error));
}
