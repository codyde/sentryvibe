import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import type { Template } from './config';
import { join } from 'path';
import { getWorkspaceRoot } from '../workspace';

const execAsync = promisify(exec);

/**
 * Download template from GitHub using degit
 * degit is faster than git clone (no history, just files)
 */
export async function downloadTemplate(
  template: Template,
  projectName: string
): Promise<string> {
  const targetPath = join(getWorkspaceRoot(), projectName);

  if (process.env.DEBUG_BUILD === '1') console.log(`📥 Downloading template: ${template.name}`);
  if (process.env.DEBUG_BUILD === '1') console.log(`   Repository: ${template.repository}`);
  if (process.env.DEBUG_BUILD === '1') console.log(`   Branch: ${template.branch}`);
  if (process.env.DEBUG_BUILD === '1') console.log(`   Target: ${targetPath}`);

  // Check if target already exists
  if (existsSync(targetPath)) {
    throw new Error(`Project directory already exists: ${targetPath}`);
  }

  // Use degit to download template
  // Format: github:username/repo#branch
  const repoUrl = template.branch !== 'main'
    ? `${template.repository}#${template.branch}`
    : template.repository;

  try {
    // Use npx degit (no install needed)
    const command = `npx degit ${repoUrl} "${targetPath}"`;

    if (process.env.DEBUG_BUILD === '1') console.log(`   Running: ${command}`);
    const { stdout, stderr } = await execAsync(command, {
      cwd: getWorkspaceRoot(),
    });

    if (stderr && !stderr.includes('degit') && !stderr.includes('cloned')) {
      if (process.env.DEBUG_BUILD === '1') console.warn(`   Warning: ${stderr}`);
    }

    if (stdout) {
      if (process.env.DEBUG_BUILD === '1') console.log(`   ${stdout}`);
    }

    if (process.env.DEBUG_BUILD === '1') console.log(`✅ Template downloaded successfully`);

    // Update package.json name(s)
    await updatePackageName(targetPath, projectName);

    // Handle multi-package projects (like vite-react-node with client/server)
    const clientPkgPath = join(targetPath, 'client', 'package.json');
    const serverPkgPath = join(targetPath, 'server', 'package.json');

    if (existsSync(clientPkgPath)) {
      await updatePackageName(join(targetPath, 'client'), `${projectName}-client`);
    }
    if (existsSync(serverPkgPath)) {
      await updatePackageName(join(targetPath, 'server'), `${projectName}-server`);
    }

    return targetPath;

  } catch (error) {
    if (process.env.DEBUG_BUILD === '1') console.error(`❌ Failed to download template:`, error);

    // Fallback to git clone if degit fails
    if (process.env.DEBUG_BUILD === '1') console.log(`⚠️  Falling back to git clone...`);
    return await downloadTemplateWithGit(template, projectName);
  }
}

/**
 * Alternative: Use git clone (fallback if degit unavailable)
 */
export async function downloadTemplateWithGit(
  template: Template,
  projectName: string
): Promise<string> {
  const targetPath = join(getWorkspaceRoot(), projectName);

  if (process.env.DEBUG_BUILD === '1') console.log(`📥 Cloning template with git: ${template.name}`);

  // Parse GitHub URL
  // "github:username/repo" → "https://github.com/username/repo.git"
  const repoUrl = template.repository.replace('github:', 'https://github.com/') + '.git';

  // Shallow clone (depth 1, no history)
  const command = `git clone --depth 1 --branch ${template.branch} "${repoUrl}" "${targetPath}"`;

  if (process.env.DEBUG_BUILD === '1') console.log(`   Running: ${command}`);

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: getWorkspaceRoot(),
    });

    if (stdout) console.log(`   ${stdout}`);
    if (stderr && !stderr.includes('Cloning')) console.log(`   ${stderr}`);

    // Remove .git directory (we don't need version history)
    try {
      await execAsync(`rm -rf "${join(targetPath, '.git')}"`);
      if (process.env.DEBUG_BUILD === '1') console.log(`   Cleaned .git directory`);
    } catch {
      // Ignore errors cleaning .git
    }

    if (process.env.DEBUG_BUILD === '1') console.log(`✅ Template cloned successfully`);

    await updatePackageName(targetPath, projectName);

    return targetPath;

  } catch (error) {
    if (process.env.DEBUG_BUILD === '1') console.error(`❌ Failed to clone template:`, error);
    throw new Error(`Template download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update package.json name field
 */
async function updatePackageName(projectPath: string, newName: string): Promise<void> {
  const pkgPath = join(projectPath, 'package.json');

  if (!existsSync(pkgPath)) {
    if (process.env.DEBUG_BUILD === '1') console.log(`   No package.json found in ${projectPath}, skipping name update`);
    return;
  }

  try {
    const content = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(content);
    pkg.name = newName;
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2));

    if (process.env.DEBUG_BUILD === '1') console.log(`   Updated package.json name to: ${newName}`);
  } catch (error) {
    if (process.env.DEBUG_BUILD === '1') console.warn(`   Failed to update package.json:`, error);
  }
}

/**
 * Get project file tree (for AI context)
 * Shows directory structure to help AI understand what's included
 */
export async function getProjectFileTree(projectPath: string): Promise<string> {
  try {
    // Try using tree command (if available)
    const { stdout } = await execAsync(
      `tree -L 3 -I 'node_modules|.git|.next|dist|build' "${projectPath}"`,
      { maxBuffer: 1024 * 1024 }
    );
    return stdout;
  } catch {
    // Fallback: use find command
    try {
      const { stdout } = await execAsync(
        `find "${projectPath}" -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/.next/*" -not -path "*/dist/*" | head -100`,
        { maxBuffer: 1024 * 1024 }
      );

      // Format as tree-like structure
      const files = stdout.trim().split('\n');
      const basePath = projectPath.split('/').pop() || projectPath;
      let tree = `${basePath}/\n`;

      files.forEach(file => {
        const relative = file.replace(projectPath, '');
        const depth = (relative.match(/\//g) || []).length;
        const indent = '  '.repeat(depth - 1);
        const fileName = relative.split('/').pop();
        tree += `${indent}├─ ${fileName}\n`;
      });

      return tree;
    } catch {
      return `Unable to generate file tree for ${projectPath}`;
    }
  }
}

/**
 * Get summary of key files in template (for AI context)
 */
export async function getTemplateFileSummary(projectPath: string): Promise<string> {
  const keyFiles = [
    'package.json',
    'tsconfig.json',
    'README.md',
    'next.config.ts',
    'next.config.js',
    'vite.config.ts',
    'astro.config.mjs',
  ];

  const summary: string[] = [];

  for (const file of keyFiles) {
    const filePath = join(projectPath, file);
    if (existsSync(filePath)) {
      summary.push(file);
    }
  }

  // Check for key directories
  const keyDirs = ['app', 'src', 'components', 'pages', 'client', 'server'];
  for (const dir of keyDirs) {
    const dirPath = join(projectPath, dir);
    if (existsSync(dirPath)) {
      summary.push(`${dir}/`);
    }
  }

  return summary.join(', ');
}
