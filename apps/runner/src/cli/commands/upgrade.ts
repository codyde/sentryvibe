/**
 * Upgrade command - In-place upgrade to latest version
 * Preserves configuration and user data while replacing application code
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, renameSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { CLIError, errors } from '../utils/cli-error.js';
import { isInsideMonorepo } from '../utils/repo-detector.js';

interface UpgradeOptions {
  branch?: string;
  force?: boolean;
}

interface EnvBackup {
  runner: { env?: string; envLocal?: string };
  broker: { env?: string; envLocal?: string };
  sentryvibe: { env?: string; envLocal?: string };
}

export async function upgradeCommand(options: UpgradeOptions) {
  const s = p.spinner();

  // Step 1: Find current monorepo
  s.start('Locating SentryVibe installation');

  const repoCheck = await isInsideMonorepo();
  if (!repoCheck.inside || !repoCheck.root) {
    s.stop(pc.red('✗') + ' Not inside SentryVibe monorepo');
    throw new CLIError({
      code: 'UPGRADE_NOT_IN_REPO',
      message: 'Upgrade must be run from within the SentryVibe directory',
      suggestions: [
        'Navigate to your SentryVibe installation directory',
        'Example: cd /Users/yourname/sentryvibe',
      ],
      docs: 'https://github.com/codyde/sentryvibe#upgrade',
    });
  }

  const monorepoRoot = repoCheck.root;
  s.stop(pc.green('✓') + ` Found: ${monorepoRoot}`);

  // Step 2: Check git status
  if (!options.force) {
    s.start('Checking for uncommitted changes');

    try {
      const gitStatus = execSync('git status --porcelain', {
        cwd: monorepoRoot,
        encoding: 'utf-8',
      }).trim();

      if (gitStatus.length > 0) {
        s.stop(pc.yellow('⚠') + ' Uncommitted changes detected');

        const changes = gitStatus.split('\n').slice(0, 5);
        console.log(pc.dim('  Modified files:'));
        changes.forEach(line => console.log(pc.dim(`    ${line}`)));

        if (!options.force) {
          const confirm = await p.confirm({
            message: 'Continue upgrade? This will discard local changes.',
            initialValue: false,
          });

          if (!confirm || p.isCancel(confirm)) {
            console.log(pc.dim('\nUpgrade cancelled'));
            process.exit(0);
          }
        }
      } else {
        s.stop(pc.green('✓') + ' No uncommitted changes');
      }
    } catch (error) {
      s.stop(pc.yellow('⚠') + ' Not a git repository');
      // Continue anyway - user might have extracted from tarball
    }
  }

  // Step 3: Backup configuration files
  s.start('Backing up configuration files');

  const envBackup: EnvBackup = {
    runner: {},
    broker: {},
    sentryvibe: {},
  };

  // Define paths to check
  const envPaths = [
    { app: 'runner', path: join(monorepoRoot, 'apps/runner/.env') },
    { app: 'runner', pathLocal: join(monorepoRoot, 'apps/runner/.env.local') },
    { app: 'broker', path: join(monorepoRoot, 'apps/broker/.env') },
    { app: 'broker', pathLocal: join(monorepoRoot, 'apps/broker/.env.local') },
    { app: 'sentryvibe', path: join(monorepoRoot, 'apps/sentryvibe/.env') },
    { app: 'sentryvibe', pathLocal: join(monorepoRoot, 'apps/sentryvibe/.env.local') },
  ];

  let backedUpCount = 0;

  for (const item of envPaths) {
    const app = item.app as keyof EnvBackup;
    const filePath = item.path || item.pathLocal!;
    const isLocal = !!item.pathLocal;

    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      if (isLocal) {
        envBackup[app].envLocal = content;
      } else {
        envBackup[app].env = content;
      }
      backedUpCount++;
    }
  }

  s.stop(pc.green('✓') + ` Backed up ${backedUpCount} configuration file(s)`);

  // Step 4: Determine branch
  const branch = options.branch || 'main';

  s.start(`Cloning fresh copy from ${pc.cyan(branch)}`);

  const parentDir = dirname(monorepoRoot);
  const repoName = monorepoRoot.split('/').pop();
  const tempDir = join(parentDir, `${repoName}-upgrade-temp`);

  // Remove temp directory if it exists from failed previous upgrade
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }

  try {
    execSync(
      `git clone --branch ${branch} --depth 1 https://github.com/codyde/sentryvibe.git "${tempDir}"`,
      {
        cwd: parentDir,
        stdio: 'pipe', // Silent
      }
    );

    s.stop(pc.green('✓') + ' Cloned successfully');
  } catch (error) {
    s.stop(pc.red('✗') + ' Clone failed');

    // Cleanup temp dir
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }

    throw new CLIError({
      code: 'UPGRADE_CLONE_FAILED',
      message: `Failed to clone branch "${branch}"`,
      suggestions: [
        'Check your internet connection',
        'Verify the branch exists: https://github.com/codyde/sentryvibe/tree/' + branch,
        'Try upgrading to main: sentryvibe upgrade',
      ],
    });
  }

  // Step 5: Restore configuration files
  s.start('Restoring configuration files');

  let restoredCount = 0;

  const restorePaths = [
    { app: 'runner' as const, file: '.env', dir: join(tempDir, 'apps/runner') },
    { app: 'runner' as const, file: '.env.local', dir: join(tempDir, 'apps/runner') },
    { app: 'broker' as const, file: '.env', dir: join(tempDir, 'apps/broker') },
    { app: 'broker' as const, file: '.env.local', dir: join(tempDir, 'apps/broker') },
    { app: 'sentryvibe' as const, file: '.env', dir: join(tempDir, 'apps/sentryvibe') },
    { app: 'sentryvibe' as const, file: '.env.local', dir: join(tempDir, 'apps/sentryvibe') },
  ];

  for (const item of restorePaths) {
    const isLocal = item.file === '.env.local';
    const backupContent = isLocal ? envBackup[item.app].envLocal : envBackup[item.app].env;

    if (backupContent) {
      const targetPath = join(item.dir, item.file);
      writeFileSync(targetPath, backupContent, 'utf-8');
      restoredCount++;
    }
  }

  s.stop(pc.green('✓') + ` Restored ${restoredCount} configuration file(s)`);

  // Step 6: Install dependencies
  s.start('Installing dependencies');

  try {
    execSync('pnpm install', {
      cwd: tempDir,
      stdio: 'pipe',
      env: { ...process.env, TURBO_TELEMETRY_DISABLED: '1' },
    });

    s.stop(pc.green('✓') + ' Dependencies installed');
  } catch (error) {
    s.stop(pc.red('✗') + ' Dependency installation failed');

    // Cleanup
    rmSync(tempDir, { recursive: true, force: true });

    throw new CLIError({
      code: 'UPGRADE_INSTALL_FAILED',
      message: 'Failed to install dependencies in new version',
      suggestions: [
        'Check if the branch is stable',
        'Try upgrading to main instead',
        'Check disk space',
      ],
    });
  }

  // Step 7: Build services
  s.start('Building services (this may take a moment)');

  try {
    execSync('pnpm turbo build', {
      cwd: tempDir,
      stdio: 'pipe',
      env: { ...process.env, TURBO_TELEMETRY_DISABLED: '1' },
    });

    s.stop(pc.green('✓') + ' Build successful');
  } catch (error) {
    s.stop(pc.red('✗') + ' Build failed');

    // Cleanup
    rmSync(tempDir, { recursive: true, force: true });

    throw new CLIError({
      code: 'UPGRADE_BUILD_FAILED',
      message: 'Failed to build new version',
      suggestions: [
        'The branch may have build errors',
        'Try upgrading to a stable release tag',
        'Check build logs for errors',
      ],
    });
  }

  // Step 7.5: Apply database migrations (if DATABASE_URL exists)
  const databaseUrl =
    envBackup.sentryvibe.env?.match(/DATABASE_URL=["']?([^"'\n]+)["']?/)?.[1] ||
    envBackup.sentryvibe.envLocal?.match(/DATABASE_URL=["']?([^"'\n]+)["']?/)?.[1] ||
    process.env.DATABASE_URL;

  if (databaseUrl) {
    s.start('Applying database migrations');

    try {
      execSync('npx drizzle-kit push --config=drizzle.config.ts', {
        cwd: join(tempDir, 'apps/sentryvibe'),
        stdio: 'pipe',
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
        },
      });

      s.stop(pc.green('✓') + ' Database schema updated');
    } catch (error) {
      s.stop(pc.yellow('⚠') + ' Migration failed');
      console.log(pc.dim('  You may need to run: sentryvibe database'));
      console.log(pc.dim('  This won\'t prevent the upgrade from completing'));
    }
  } else {
    s.start('Skipping database migrations (no DATABASE_URL found)');
    s.stop(pc.yellow('⚠') + ' No database configured');
  }

  // Step 8: Swap directories (atomic operation)
  s.start('Finalizing upgrade');

  const backupDir = join(parentDir, `${repoName}-backup-${Date.now()}`);

  try {
    // Rename current installation to backup
    renameSync(monorepoRoot, backupDir);

    // Rename new installation to production
    renameSync(tempDir, monorepoRoot);

    s.stop(pc.green('✓') + ' Upgrade finalized');
  } catch (error) {
    s.stop(pc.red('✗') + ' Failed to swap directories');

    // Attempt recovery
    try {
      if (existsSync(backupDir)) {
        renameSync(backupDir, monorepoRoot);
        console.log(pc.yellow('⚠') + ' Restored original installation');
      }
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (recoveryError) {
      console.error(pc.red('❌') + ' Failed to recover. Manual intervention required.');
      console.error(pc.dim(`   Backup location: ${backupDir}`));
    }

    throw error;
  }

  // Step 9: Cleanup backup
  s.start('Cleaning up');

  try {
    rmSync(backupDir, { recursive: true, force: true });
    s.stop(pc.green('✓') + ' Cleanup complete');
  } catch (error) {
    s.stop(pc.yellow('⚠') + ' Could not remove backup');
    console.log(pc.dim(`   You can manually delete: ${backupDir}`));
  }

  // Success!
  console.log();
  console.log(pc.green('✓') + pc.bold(' Upgrade complete!'));
  console.log();
  console.log(pc.dim('  Note: Restart your terminal to use the updated CLI'));
  console.log(pc.dim('  Or run: hash -r'));
  console.log();

  if (branch !== 'main') {
    console.log(pc.yellow('⚠') + ` You upgraded to branch: ${pc.cyan(branch)}`);
    console.log(pc.dim('  To return to main: sentryvibe upgrade'));
    console.log();
  }
}
