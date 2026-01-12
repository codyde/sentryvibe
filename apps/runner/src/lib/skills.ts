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
 * @param projectDirectory - The project's working directory
 * @returns true if skills were copied, false if they already existed or source doesn't exist
 */
export function ensureProjectSkills(projectDirectory: string): boolean {
  const projectSkillsDir = join(projectDirectory, '.claude', 'skills');
  
  // Find bundled skills directory
  const bundledSkillsDir = getBundledSkillsDir();
  if (!bundledSkillsDir) {
    return false;
  }
  
  // Get list of bundled skills
  const bundledSkills = readdirSync(bundledSkillsDir).filter(name => {
    const skillPath = join(bundledSkillsDir, name);
    return statSync(skillPath).isDirectory();
  });
  
  if (bundledSkills.length === 0) {
    return false;
  }
  
  let copiedAny = false;
  
  for (const skillName of bundledSkills) {
    const srcSkillDir = join(bundledSkillsDir, skillName);
    const destSkillDir = join(projectSkillsDir, skillName);
    
    // Skip if skill already exists in project
    if (existsSync(destSkillDir)) {
      console.log(`[skills] Skill "${skillName}" already exists in project`);
      continue;
    }
    
    // Copy skill to project
    console.log(`[skills] Copying skill "${skillName}" to ${destSkillDir}`);
    copyDirSync(srcSkillDir, destSkillDir);
    copiedAny = true;
  }
  
  return copiedAny;
}

/**
 * List available bundled skills
 */
export function listBundledSkills(): string[] {
  const bundledSkillsDir = getBundledSkillsDir();
  if (!bundledSkillsDir) {
    return [];
  }
  
  return readdirSync(bundledSkillsDir).filter(name => {
    const skillPath = join(bundledSkillsDir, name);
    return statSync(skillPath).isDirectory();
  });
}
