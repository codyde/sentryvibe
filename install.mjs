#!/usr/bin/env node

/**
 * SentryVibe CLI Installer
 * 
 * A beautiful, Sentry-instrumented installer for the SentryVibe CLI.
 * 
 * Usage: curl -fsSL https://sentryvibe.app/install.mjs | node -
 */

import { execSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { setTimeout as sleep } from 'node:timers/promises';

// ANSI 256-color support for hex-like colors
// These match the TUI theme.ts colors
const hex = {
  cyan: '\x1b[38;2;6;182;212m',       // #06b6d4
  purple: '\x1b[38;2;168;85;247m',    // #a855f7
  brightPurple: '\x1b[38;2;192;132;252m', // #c084fc
  success: '\x1b[38;2;34;197;94m',    // #22c55e
  error: '\x1b[38;2;239;68;68m',      // #ef4444
  warning: '\x1b[38;2;245;158;11m',   // #f59e0b
  white: '\x1b[38;2;255;255;255m',    // #ffffff
  gray: '\x1b[38;2;107;114;128m',     // #6b7280
  dimGray: '\x1b[38;2;75;85;99m',     // #4b5563
};

const c = {
  ...hex,
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

// Symbols - matching TUI theme
const S = {
  success: `${c.success}✓${c.reset}`,
  error: `${c.error}✗${c.reset}`,
  warning: `${c.warning}!${c.reset}`,
  info: `${c.cyan}●${c.reset}`,
  check: '✓',
  cross: '✗',
  // Braille spinner frames from TUI theme
  spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
};

// Installation context for Sentry
const installContext = {
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch,
  targetVersion: null,
  startTime: Date.now(),
};

// Sentry integration (lightweight, no dependencies)
const SENTRY_DSN = 'https://67fd3805ad7dbe3fccac79f35ce6d55f@o4508130833793024.ingest.us.sentry.io/4510671427207168';

async function sendToSentry(error, level = 'error', extra = {}) {
  try {
    const [, , projectId] = SENTRY_DSN.match(/\/\/(.+)@(.+)\/(\d+)/) || [];
    const [, authKey, host] = SENTRY_DSN.match(/\/\/(.+)@(.+)\//) || [];
    
    if (!projectId || !authKey || !host) return;
    
    const endpoint = `https://${host}/api/${projectId}/envelope/`;
    
    const eventId = crypto.randomUUID().replace(/-/g, '');
    const timestamp = new Date().toISOString();
    
    const envelope = [
      JSON.stringify({
        event_id: eventId,
        sent_at: timestamp,
        dsn: SENTRY_DSN,
      }),
      JSON.stringify({ type: 'event' }),
      JSON.stringify({
        event_id: eventId,
        timestamp: Date.now() / 1000,
        level,
        platform: 'node',
        logger: 'sentryvibe-installer',
        server_name: 'installer',
        release: installContext.targetVersion || 'unknown',
        environment: 'production',
        tags: {
          installer: 'true',
          node_version: installContext.nodeVersion,
          platform: installContext.platform,
          arch: installContext.arch,
        },
        extra: {
          ...installContext,
          ...extra,
          duration_ms: Date.now() - installContext.startTime,
        },
        exception: error ? {
          values: [{
            type: error.name || 'Error',
            value: error.message || String(error),
            stacktrace: error.stack ? {
              frames: error.stack.split('\n').slice(1).map(line => {
                const match = line.match(/at\s+(.+)\s+\((.+):(\d+):(\d+)\)/) ||
                              line.match(/at\s+(.+):(\d+):(\d+)/);
                if (match) {
                  return {
                    function: match[1] || '<anonymous>',
                    filename: match[2] || match[1],
                    lineno: parseInt(match[3] || match[2], 10),
                    colno: parseInt(match[4] || match[3], 10),
                  };
                }
                return { function: line.trim() };
              }).reverse(),
            } : undefined,
          }],
        } : undefined,
        message: !error ? { formatted: extra.message || 'Installer event' } : undefined,
      }),
    ].join('\n');

    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=sentryvibe-installer/1.0, sentry_key=${authKey}`,
      },
      body: envelope,
    });
  } catch {
    // Silently fail - don't break installer if Sentry is down
  }
}

// Banner - matching TUI Banner.tsx exactly
function printBanner() {
  // Same structure as TUI: SENTRY in cyan, VIBE in brightPurple
  const lines = [
    { sentry: '███████╗███████╗███╗   ██╗████████╗██████╗ ██╗   ██╗', vibe: '██╗   ██╗██╗██████╗ ███████╗' },
    { sentry: '██╔════╝██╔════╝████╗  ██║╚══██╔══╝██╔══██╗╚██╗ ██╔╝', vibe: '██║   ██║██║██╔══██╗██╔════╝' },
    { sentry: '███████╗█████╗  ██╔██╗ ██║   ██║   ██████╔╝ ╚████╔╝ ', vibe: '██║   ██║██║██████╔╝█████╗  ' },
    { sentry: '╚════██║██╔══╝  ██║╚██╗██║   ██║   ██╔══██╗  ╚██╔╝  ', vibe: '╚██╗ ██╔╝██║██╔══██╗██╔══╝  ' },
    { sentry: '███████║███████╗██║ ╚████║   ██║   ██║  ██║   ██║   ', vibe: ' ╚████╔╝ ██║██████╔╝███████╗' },
    { sentry: '╚══════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝   ', vibe: '  ╚═══╝  ╚═╝╚═════╝ ╚══════╝' },
  ];

  console.log();
  for (const line of lines) {
    console.log(`  ${c.cyan}${line.sentry}${c.brightPurple}${line.vibe}${c.reset}`);
  }
  console.log();
}

// Spinner helper - matching TUI timing (120ms)
class Spinner {
  constructor(message) {
    this.message = message;
    this.frameIndex = 0;
    this.interval = null;
  }

  start() {
    process.stdout.write(`  ${c.cyan}${S.spinner[0]}${c.reset} ${this.message}`);
    this.interval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % S.spinner.length;
      process.stdout.write(`\r  ${c.cyan}${S.spinner[this.frameIndex]}${c.reset} ${this.message}`);
    }, 120); // Match TUI spinnerInterval
    return this;
  }

  stop(symbol, newMessage) {
    clearInterval(this.interval);
    process.stdout.write(`\r  ${symbol} ${newMessage || this.message}\x1b[K\n`);
  }

  success(message) {
    this.stop(S.success, message);
  }

  error(message) {
    this.stop(S.error, message);
  }
}

// Check Node.js version
function checkNodeVersion() {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);
  
  if (major < 20) {
    console.log(`  ${S.error} Node.js 20+ required ${c.dimGray}(you have ${version})${c.reset}`);
    console.log();
    console.log(`  ${c.dimGray}Install Node.js 20+ from https://nodejs.org${c.reset}`);
    console.log();
    process.exit(1);
  }
  
  console.log(`  ${S.success} Node.js ${c.dimGray}${version}${c.reset}`);
  return version;
}

// Get latest release version
async function getLatestVersion() {
  const spinner = new Spinner('Fetching latest release...').start();
  
  try {
    // Try GitHub releases API first
    const response = await fetch('https://api.github.com/repos/codyde/sentryvibe/releases/latest', {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
    });
    
    if (response.ok) {
      const data = await response.json();
      const version = data.tag_name;
      installContext.targetVersion = version;
      spinner.success(`Latest version: ${c.cyan}${version}${c.reset}`);
      return version;
    }
    
    // Fallback to npm registry
    const npmResponse = await fetch('https://registry.npmjs.org/@sentryvibe/runner-cli/latest');
    if (npmResponse.ok) {
      const data = await npmResponse.json();
      const version = `v${data.version}`;
      installContext.targetVersion = version;
      spinner.success(`Latest version: ${c.cyan}${version}${c.reset}`);
      return version;
    }
    
    throw new Error('Could not determine latest version');
  } catch (error) {
    spinner.error('Failed to fetch latest version');
    await sendToSentry(error, 'error', { step: 'getLatestVersion' });
    throw error;
  }
}

// Install the CLI
async function installCLI(version) {
  const downloadUrl = `https://github.com/codyde/sentryvibe/releases/download/${version}/sentryvibe-cli.tgz`;
  
  const spinner = new Spinner('Installing SentryVibe CLI...').start();
  
  return new Promise((resolve, reject) => {
    // Set increased heap size for large packages
    const env = {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=8192`.trim(),
    };
    
    const npm = spawn('npm', ['install', '-g', downloadUrl], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    let stdout = '';
    let stderr = '';
    
    npm.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    npm.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    npm.on('close', async (code) => {
      if (code === 0) {
        spinner.success('SentryVibe CLI installed');
        
        // Send success event
        await sendToSentry(null, 'info', {
          message: 'Installation successful',
          step: 'installCLI',
          version,
        });
        
        resolve();
      } else {
        spinner.error('Installation failed');
        
        const error = new Error(`npm install failed with code ${code}`);
        error.stdout = stdout;
        error.stderr = stderr;
        
        await sendToSentry(error, 'error', {
          step: 'installCLI',
          version,
          exitCode: code,
          stdout: stdout.slice(-2000), // Last 2000 chars
          stderr: stderr.slice(-2000),
        });
        
        reject(error);
      }
    });
    
    npm.on('error', async (error) => {
      spinner.error('Installation failed');
      await sendToSentry(error, 'error', { step: 'installCLI', version });
      reject(error);
    });
  });
}

// Verify installation
function verifyInstallation() {
  try {
    const output = execSync('sentryvibe --version', { encoding: 'utf8' }).trim();
    // Extract just the version number (last line or the line with the version)
    const lines = output.split('\n');
    const versionLine = lines.find(l => /^\d+\.\d+\.\d+/.test(l.trim())) || lines[lines.length - 1];
    const version = versionLine.trim();
    console.log(`  ${S.success} Verified: ${c.dim}sentryvibe v${version}${c.reset}`);
    return true;
  } catch {
    console.log(`  ${S.warning} Could not verify installation`);
    return false;
  }
}

// Print success message
function printSuccess() {
  console.log();
  console.log(`${c.success}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`${c.success}  ${c.bold}Installation complete!${c.reset}`);
  console.log(`${c.success}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log();
  console.log(`  ${c.dimGray}Get started:${c.reset}`);
  console.log();
  console.log(`    ${c.cyan}sentryvibe${c.reset}          Launch the interactive TUI`);
  console.log(`    ${c.cyan}sentryvibe init${c.reset}     Initialize configuration`);
  console.log(`    ${c.cyan}sentryvibe --help${c.reset}   Show all commands`);
  console.log();
}

// Print failure message
function printFailure(error) {
  console.log();
  console.log(`${c.error}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`${c.error}  ${c.bold}Installation failed${c.reset}`);
  console.log(`${c.error}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log();
  
  if (error.stderr?.includes('heap out of memory') || error.stderr?.includes('ENOMEM')) {
    console.log(`  ${c.warning}Out of memory error detected.${c.reset}`);
    console.log();
    console.log(`  ${c.dimGray}Try running with increased memory:${c.reset}`);
    console.log(`    ${c.cyan}NODE_OPTIONS="--max-old-space-size=8192" npm install -g @sentryvibe/runner-cli${c.reset}`);
  } else {
    console.log(`  ${c.dimGray}Try manual installation:${c.reset}`);
    console.log(`    ${c.cyan}npm install -g @sentryvibe/runner-cli${c.reset}`);
  }
  console.log();
  console.log(`  ${c.dimGray}If the problem persists, please report it at:${c.reset}`);
  console.log(`    ${c.purple}https://github.com/codyde/sentryvibe/issues${c.reset}`);
  console.log();
}

// Main installer
async function main() {
  printBanner();
  
  console.log(`  ${c.dim}Installing SentryVibe CLI${c.reset}`);
  console.log();
  
  try {
    // Check prerequisites
    checkNodeVersion();
    
    // Get latest version
    const version = await getLatestVersion();
    
    // Install
    console.log();
    await installCLI(version);
    
    // Verify
    verifyInstallation();
    
    // Success!
    printSuccess();
    
  } catch (error) {
    printFailure(error);
    process.exit(1);
  }
}

// Run
main().catch(async (error) => {
  await sendToSentry(error, 'fatal', { step: 'main' });
  console.error(`\n  ${S.error} Unexpected error: ${error.message}\n`);
  process.exit(1);
});
