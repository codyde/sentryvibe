/**
 * Skills management for Claude Code projects.
 * 
 * This module handles copying bundled skills to project directories
 * so they can be loaded by Claude Code when running in that project.
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the directory of this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Find the bundled skills directory.
 * Works in both development (src/lib/) and production (dist/lib/) modes.
 */
function findBundledSkillsDir(): string | null {
  // Try multiple possible locations
  const possiblePaths = [
    // Development: apps/runner/src/lib/ -> apps/runner/.claude/skills/
    join(__dirname, '..', '..', '.claude', 'skills'),
    // Production from dist/lib/: apps/runner/dist/lib/ -> apps/runner/.claude/skills/
    join(__dirname, '..', '..', '..', '.claude', 'skills'),
    // Global install: might be in package root
    join(__dirname, '..', '..', '..', '..', '.claude', 'skills'),
  ];
  
  for (const skillsPath of possiblePaths) {
    if (existsSync(skillsPath)) {
      const skills = readdirSync(skillsPath).filter(name => {
        const fullPath = join(skillsPath, name);
        return statSync(fullPath).isDirectory();
      });
      if (skills.length > 0) {
        console.log(`[skills] Found bundled skills at: ${skillsPath}`);
        return skillsPath;
      }
    }
  }
  
  console.log(`[skills] No bundled skills found. Searched paths:`, possiblePaths);
  return null;
}

// Cache the skills directory path
let _bundledSkillsDir: string | null | undefined = undefined;

function getBundledSkillsDir(): string | null {
  if (_bundledSkillsDir === undefined) {
    _bundledSkillsDir = findBundledSkillsDir();
  }
  return _bundledSkillsDir;
}

/**
 * Copy a directory recursively
 */
function copyDirSync(src: string, dest: string): void {
  if (!existsSync(src)) {
    return;
  }
  
  mkdirSync(dest, { recursive: true });
  
  const entries = readdirSync(src);
  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    
    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Ensure skills are available in a project directory.
 * Copies bundled skills to the project's .claude/skills/ directory.
 * 
 * NOTE: Skills are now included in project templates directly, so this
 * function is disabled. Templates include .claude/skills/github-setup/
 * which gets cleaned up after successful GitHub setup.
 * 
 * @param _projectDirectory - The project's working directory (unused - skills bundled in templates)
 * @returns false - skills are now bundled with templates
 */
export function ensureProjectSkills(_projectDirectory: string): boolean {
  // Skills are now bundled with templates - no need to copy at runtime
  // The github-setup skill self-deletes after successful repo creation
  return false;
}

/**
 * List available bundled skills
 */
export function listBundledSkills(): string[] {
  const bundledSkillsDir = getBundledSkillsDir();
  if (!bundledSkillsDir) {
    return [];
  }
  
  // Store in const to help TypeScript narrow the type
  const skillsDir = bundledSkillsDir;
  return readdirSync(skillsDir).filter(name => {
    const skillPath = join(skillsDir, name);
    return statSync(skillPath).isDirectory();
  });
}
