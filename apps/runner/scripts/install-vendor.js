#!/usr/bin/env node
// Install vendor Sentry packages from bundled tarballs
const { execSync } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

// Get the package root (where this script is located)
const packageRoot = path.join(__dirname, '..');
const vendorDir = path.join(packageRoot, 'vendor');

console.log('Installing vendor Sentry packages...');

if (!existsSync(vendorDir)) {
  console.log('No vendor directory found, skipping...');
  process.exit(0);
}

const nodeTarball = path.join(vendorDir, 'sentry-node-10.17.0.tgz');
const nextjsTarball = path.join(vendorDir, 'sentry-nextjs-10.17.0.tgz');

if (!existsSync(nodeTarball) || !existsSync(nextjsTarball)) {
  console.log('Vendor tarballs not found, skipping...');
  process.exit(0);
}

try {
  // Extract tarballs to temp, then move to node_modules
  const tempDir = path.join(packageRoot, 'temp-vendor');

  // Extract and install
  execSync(`mkdir -p ${tempDir}`, { stdio: 'inherit' });
  execSync(`tar -xzf "${nodeTarball}" -C ${tempDir}`, { stdio: 'pipe' });
  execSync(`tar -xzf "${nextjsTarball}" -C ${tempDir}`, { stdio: 'pipe' });

  // Move extracted packages to node_modules
  const nodeModules = path.join(packageRoot, 'node_modules');
  execSync(`mkdir -p ${nodeModules}/@sentry`, { stdio: 'pipe' });

  // Move package/... contents to node_modules/@sentry/...
  execSync(`cp -R ${tempDir}/package/* ${nodeModules}/@sentry/node 2>/dev/null || mv ${tempDir}/package ${nodeModules}/@sentry/node`, { stdio: 'pipe' });

  // Clean up temp
  execSync(`rm -rf ${tempDir}`, { stdio: 'pipe' });

  console.log('✓ Vendor packages installed successfully');
} catch (error) {
  console.warn('Warning: Could not install vendor packages, using published versions');
  console.warn(error.message);
}
