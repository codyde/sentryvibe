import { simpleGit } from 'simple-git';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from './logger.js';
import { spinner } from './spinner.js';

const DEFAULT_REPO_URL = 'https://github.com/codyde/sentryvibe.git';
const DEFAULT_CLONE_PATH = join(process.cwd(), 'sentryvibe'); // Current directory + /sentryvibe

export interface CloneOptions {
  repoUrl?: string;
  targetPath?: string;
  branch?: string;
}

/**
 * Clone the SentryVibe repository
 */
export async function cloneRepository(options: CloneOptions = {}): Promise<string> {
  const repoUrl = options.repoUrl || DEFAULT_REPO_URL;
  const targetPath = options.targetPath || DEFAULT_CLONE_PATH;
  const branch = options.branch || 'main';

  logger.info(`Repository: ${repoUrl}`);
  logger.info(`Target: ${targetPath}`);
  logger.info(`Branch: ${branch}`);
  logger.log('');

  // Check if target already exists (should be handled by caller)
  if (existsSync(targetPath)) {
    logger.warn(`Directory already exists: ${targetPath}`);
    logger.warn('This should have been handled by init command');
    // Continue anyway - caller should have cleaned it up
  }

  // Create parent directory if needed
  const parentPath = join(targetPath, '..');
  if (!existsSync(parentPath)) {
    await mkdir(parentPath, { recursive: true });
  }

  spinner.start('Cloning repository...');

  try {
    const git = simpleGit();

    await git.clone(repoUrl, targetPath, [
      '--branch', branch,
      '--single-branch',
      '--depth', '1', // Shallow clone for faster download
    ]);

    spinner.succeed('Repository cloned successfully');
    return targetPath;
  } catch (error) {
    spinner.fail('Failed to clone repository');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

/**
 * Install dependencies in the cloned repository
 */
export async function installDependencies(repoPath: string): Promise<void> {
  const { spawn } = await import('child_process');

  spinner.start('Installing dependencies (this may take a few minutes)...');

  return new Promise((resolve, reject) => {
    const proc = spawn('pnpm', ['install'], {
      cwd: repoPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let hasError = false;
    let stderrBuffer = '';
    let stdoutBuffer = '';

    proc.stdout?.on('data', (data) => {
      stdoutBuffer += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      stderrBuffer += text;

      // Show critical errors immediately
      if (text.includes('ERR!') || text.includes('ERROR') || text.includes('ELIFECYCLE')) {
        hasError = true;
        spinner.stop();
        logger.error(text.trim());
      }
    });

    proc.on('exit', (code) => {
      if (code === 0 && !hasError) {
        spinner.succeed('Dependencies installed');
        resolve();
      } else {
        spinner.fail('Failed to install dependencies');

        // Show full output on failure
        logger.log('');
        logger.error('Installation failed. Full output:');
        logger.log('');

        if (stderrBuffer) {
          logger.error('STDERR:');
          logger.log(stderrBuffer);
        }

        if (stdoutBuffer) {
          logger.log('STDOUT:');
          logger.log(stdoutBuffer);
        }

        reject(new Error(`pnpm install exited with code ${code}`));
      }
    });

    proc.on('error', (error) => {
      spinner.fail('Failed to install dependencies');
      logger.error(`Process error: ${error.message}`);
      reject(error);
    });
  });
}

/**
 * Build agent-core package (required before running apps)
 */
export async function buildAgentCore(repoPath: string): Promise<void> {
  const { spawn } = await import('child_process');

  spinner.start('Building agent-core package...');

  return new Promise((resolve, reject) => {
    const proc = spawn('pnpm', ['--filter', '@sentryvibe/agent-core', 'build'], {
      cwd: repoPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let hasError = false;
    let errorOutput = '';

    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      // Capture errors but don't spam the console
      if (text.includes('ERR!') || text.includes('ERROR')) {
        hasError = true;
        errorOutput += text;
      }
    });

    proc.on('exit', (code) => {
      if (code === 0 && !hasError) {
        spinner.succeed('agent-core package built');
        resolve();
      } else {
        spinner.fail('Failed to build agent-core package');
        if (errorOutput) {
          logger.error(errorOutput.trim());
        }
        reject(new Error(`agent-core build exited with code ${code}`));
      }
    });

    proc.on('error', (error) => {
      spinner.fail('Failed to build agent-core package');
      reject(error);
    });
  });
}

/**
 * Check if pnpm is installed
 */
export async function isPnpmInstalled(): Promise<boolean> {
  const { spawn } = await import('child_process');

  return new Promise((resolve) => {
    const proc = spawn('pnpm', ['--version'], {
      stdio: 'ignore',
      shell: true,
    });

    proc.on('exit', (code) => {
      resolve(code === 0);
    });

    proc.on('error', () => {
      resolve(false);
    });
  });
}
