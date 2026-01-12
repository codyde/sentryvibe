/**
 * Skills management for Claude Code projects.
 * 
 * This module handles copying bundled skills to project directories
 * so they can be loaded by Claude Code when running in that project.
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the directory of this module (apps/runner/src/lib/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to bundled skills in the runner
// In dev: apps/runner/.claude/skills/
// In build: dist/.claude/skills/ (needs to be copied during build)
const BUNDLED_SKILLS_DIR = join(__dirname, '..', '..', '.claude', 'skills');

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
  // DISABLED: Skills copying is temporarily disabled to test without skills.
  // The chat message includes inline instructions as a fallback.
  // To re-enable, remove this early return.
  if (true) {
    return false;
  }
  
  const projectSkillsDir = join(projectDirectory, '.claude', 'skills');
  
  // Check if bundled skills exist
  if (!existsSync(BUNDLED_SKILLS_DIR)) {
    console.log(`[skills] No bundled skills found at ${BUNDLED_SKILLS_DIR}`);
    return false;
  }
  
  // Get list of bundled skills
  const bundledSkills = readdirSync(BUNDLED_SKILLS_DIR).filter(name => {
    const skillPath = join(BUNDLED_SKILLS_DIR, name);
    return statSync(skillPath).isDirectory();
  });
  
  if (bundledSkills.length === 0) {
    return false;
  }
  
  let copiedAny = false;
  
  for (const skillName of bundledSkills) {
    const srcSkillDir = join(BUNDLED_SKILLS_DIR, skillName);
    const destSkillDir = join(projectSkillsDir, skillName);
    
    // Skip if skill already exists in project
    if (existsSync(destSkillDir)) {
      continue;
    }
    
    // Copy skill to project
    console.log(`[skills] Copying skill "${skillName}" to project`);
    copyDirSync(srcSkillDir, destSkillDir);
    copiedAny = true;
  }
  
  return copiedAny;
}

/**
 * List available bundled skills
 */
export function listBundledSkills(): string[] {
  if (!existsSync(BUNDLED_SKILLS_DIR)) {
    return [];
  }
  
  return readdirSync(BUNDLED_SKILLS_DIR).filter(name => {
    const skillPath = join(BUNDLED_SKILLS_DIR, name);
    return statSync(skillPath).isDirectory();
  });
}
