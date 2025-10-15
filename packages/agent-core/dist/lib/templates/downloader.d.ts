import type { Template } from './config';
/**
 * Download template from GitHub using degit
 * degit is faster than git clone (no history, just files)
 */
export declare function downloadTemplate(template: Template, projectName: string): Promise<string>;
/**
 * Alternative: Use git clone (fallback if degit unavailable)
 */
export declare function downloadTemplateWithGit(template: Template, projectName: string): Promise<string>;
/**
 * Get project file tree (for AI context)
 * Shows directory structure to help AI understand what's included
 */
export declare function getProjectFileTree(projectPath: string): Promise<string>;
/**
 * Get summary of key files in template (for AI context)
 */
export declare function getTemplateFileSummary(projectPath: string): Promise<string>;
