#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageRoot = path.join(__dirname, '..');
const nodeModules = path.join(packageRoot, 'node_modules');

if (!existsSync(nodeModules)) {
  process.exit(0);
}

try {
  execFileSync(
    'node',
    ['-e', "require('node:module').createRequire(require('node:url').pathToFileURL(process.cwd() + '/node_modules/@sentry/node/package.json')).resolve('@opentelemetry/sdk-trace-base')"],
    { cwd: packageRoot, stdio: 'pipe' },
  );
} catch (error) {
  console.log('Installing @opentelemetry/sdk-trace-base via pnpm...');
  try {
    execFileSync('pnpm', ['install', '@opentelemetry/sdk-trace-base@^2.1.0'], {
      cwd: packageRoot,
      stdio: 'inherit',
    });
  } catch (installError) {
    console.warn('Warning: Failed to install @opentelemetry/sdk-trace-base automatically. Please install it manually.');
    console.warn(installError instanceof Error ? installError.message : String(installError));
  }
}
