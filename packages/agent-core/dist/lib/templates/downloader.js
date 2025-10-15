"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadTemplate = downloadTemplate;
exports.downloadTemplateWithGit = downloadTemplateWithGit;
exports.getProjectFileTree = getProjectFileTree;
exports.getTemplateFileSummary = getTemplateFileSummary;
const child_process_1 = require("child_process");
const util_1 = require("util");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const workspace_1 = require("@/lib/workspace");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * Download template from GitHub using degit
 * degit is faster than git clone (no history, just files)
 */
async function downloadTemplate(template, projectName) {
    const targetPath = (0, path_1.join)((0, workspace_1.getWorkspaceRoot)(), projectName);
    console.log(`📥 Downloading template: ${template.name}`);
    console.log(`   Repository: ${template.repository}`);
    console.log(`   Branch: ${template.branch}`);
    console.log(`   Target: ${targetPath}`);
    // Check if target already exists
    if ((0, fs_1.existsSync)(targetPath)) {
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
        console.log(`   Running: ${command}`);
        const { stdout, stderr } = await execAsync(command, {
            cwd: (0, workspace_1.getWorkspaceRoot)(),
        });
        if (stderr && !stderr.includes('degit') && !stderr.includes('cloned')) {
            console.warn(`   Warning: ${stderr}`);
        }
        if (stdout) {
            console.log(`   ${stdout}`);
        }
        console.log(`✅ Template downloaded successfully`);
        // Update package.json name(s)
        await updatePackageName(targetPath, projectName);
        // Handle multi-package projects (like vite-react-node with client/server)
        const clientPkgPath = (0, path_1.join)(targetPath, 'client', 'package.json');
        const serverPkgPath = (0, path_1.join)(targetPath, 'server', 'package.json');
        if ((0, fs_1.existsSync)(clientPkgPath)) {
            await updatePackageName((0, path_1.join)(targetPath, 'client'), `${projectName}-client`);
        }
        if ((0, fs_1.existsSync)(serverPkgPath)) {
            await updatePackageName((0, path_1.join)(targetPath, 'server'), `${projectName}-server`);
        }
        return targetPath;
    }
    catch (error) {
        console.error(`❌ Failed to download template:`, error);
        // Fallback to git clone if degit fails
        console.log(`⚠️  Falling back to git clone...`);
        return await downloadTemplateWithGit(template, projectName);
    }
}
/**
 * Alternative: Use git clone (fallback if degit unavailable)
 */
async function downloadTemplateWithGit(template, projectName) {
    const targetPath = (0, path_1.join)((0, workspace_1.getWorkspaceRoot)(), projectName);
    console.log(`📥 Cloning template with git: ${template.name}`);
    // Parse GitHub URL
    // "github:username/repo" → "https://github.com/username/repo.git"
    const repoUrl = template.repository.replace('github:', 'https://github.com/') + '.git';
    // Shallow clone (depth 1, no history)
    const command = `git clone --depth 1 --branch ${template.branch} "${repoUrl}" "${targetPath}"`;
    console.log(`   Running: ${command}`);
    try {
        const { stdout, stderr } = await execAsync(command, {
            cwd: (0, workspace_1.getWorkspaceRoot)(),
        });
        if (stdout)
            console.log(`   ${stdout}`);
        if (stderr && !stderr.includes('Cloning'))
            console.log(`   ${stderr}`);
        // Remove .git directory (we don't need version history)
        try {
            await execAsync(`rm -rf "${(0, path_1.join)(targetPath, '.git')}"`);
            console.log(`   Cleaned .git directory`);
        }
        catch {
            // Ignore errors cleaning .git
        }
        console.log(`✅ Template cloned successfully`);
        await updatePackageName(targetPath, projectName);
        return targetPath;
    }
    catch (error) {
        console.error(`❌ Failed to clone template:`, error);
        throw new Error(`Template download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
/**
 * Update package.json name field
 */
async function updatePackageName(projectPath, newName) {
    const pkgPath = (0, path_1.join)(projectPath, 'package.json');
    if (!(0, fs_1.existsSync)(pkgPath)) {
        console.log(`   No package.json found in ${projectPath}, skipping name update`);
        return;
    }
    try {
        const content = await (0, promises_1.readFile)(pkgPath, 'utf-8');
        const pkg = JSON.parse(content);
        pkg.name = newName;
        await (0, promises_1.writeFile)(pkgPath, JSON.stringify(pkg, null, 2));
        console.log(`   Updated package.json name to: ${newName}`);
    }
    catch (error) {
        console.warn(`   Failed to update package.json:`, error);
    }
}
/**
 * Get project file tree (for AI context)
 * Shows directory structure to help AI understand what's included
 */
async function getProjectFileTree(projectPath) {
    try {
        // Try using tree command (if available)
        const { stdout } = await execAsync(`tree -L 3 -I 'node_modules|.git|.next|dist|build' "${projectPath}"`, { maxBuffer: 1024 * 1024 });
        return stdout;
    }
    catch {
        // Fallback: use find command
        try {
            const { stdout } = await execAsync(`find "${projectPath}" -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/.next/*" -not -path "*/dist/*" | head -100`, { maxBuffer: 1024 * 1024 });
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
        }
        catch {
            return `Unable to generate file tree for ${projectPath}`;
        }
    }
}
/**
 * Get summary of key files in template (for AI context)
 */
async function getTemplateFileSummary(projectPath) {
    const keyFiles = [
        'package.json',
        'tsconfig.json',
        'README.md',
        'next.config.ts',
        'next.config.js',
        'vite.config.ts',
        'astro.config.mjs',
    ];
    const summary = [];
    for (const file of keyFiles) {
        const filePath = (0, path_1.join)(projectPath, file);
        if ((0, fs_1.existsSync)(filePath)) {
            summary.push(file);
        }
    }
    // Check for key directories
    const keyDirs = ['app', 'src', 'components', 'pages', 'client', 'server'];
    for (const dir of keyDirs) {
        const dirPath = (0, path_1.join)(projectPath, dir);
        if ((0, fs_1.existsSync)(dirPath)) {
            summary.push(`${dir}/`);
        }
    }
    return summary.join(', ');
}
