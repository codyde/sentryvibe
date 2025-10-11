import { resolve, relative, isAbsolute } from 'path';
import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk';

/**
 * Creates a permission handler that restricts Claude to a specific project directory
 *
 * This provides defense-in-depth security by:
 * 1. Blocking file operations outside the project directory
 * 2. Preventing directory traversal attacks (../)
 * 3. Blocking dangerous bash commands (rm -rf /, sudo, etc.)
 * 4. Preventing directory changes that escape the project
 *
 * @param projectDirectory Absolute path to the project directory (e.g., /Users/codydearkland/sentryvibe-workspace/codyscoolnewapp)
 * @returns Permission handler function for use with Claude Agent SDK
 */
export function createProjectScopedPermissionHandler(projectDirectory: string): CanUseTool {
  const normalizedProjectDir = resolve(projectDirectory);

  console.log(`[permissions] Creating scoped handler for: ${normalizedProjectDir}`);

  return async (toolName, input, { signal, suggestions }) => {
    console.log(`[permissions] 🔍 Evaluating tool: ${toolName} with input:`, JSON.stringify(input, null, 2));

    // Helper: Check if a path is within the project directory
    const isWithinProject = (filePath: string): boolean => {
      const absPath = resolve(normalizedProjectDir, filePath);
      const relPath = relative(normalizedProjectDir, absPath);

      // Path is within project if:
      // 1. Relative path doesn't start with '..' (not going up)
      // 2. Relative path is not absolute (not escaping to root)
      const isWithin = !relPath.startsWith('..') && !isAbsolute(relPath);

      console.log(`[permissions]   📁 Path check: "${filePath}" -> abs: "${absPath}" -> rel: "${relPath}" -> within: ${isWithin}`);

      return isWithin;
    };

    // 1️⃣ FILE OPERATIONS - Restrict to project directory
    if (['Read', 'Write', 'Edit', 'NotebookEdit'].includes(toolName)) {
      const filePath = (input.file_path || input.notebook_path) as string | undefined;

      if (!filePath) {
        // No path provided - allow (will use cwd)
        console.log(`[permissions] ✅ ALLOWED ${toolName}: No path specified (will use cwd)`);
        return { behavior: 'allow', updatedInput: input };
      }

      if (!isWithinProject(filePath)) {
        console.warn(`[permissions] ❌ ❌ ❌ DENIED ${toolName} - File outside project boundary`);
        console.warn(`[permissions]   Attempted: ${filePath}`);
        console.warn(`[permissions]   Allowed:   ${normalizedProjectDir}`);
        return {
          behavior: 'deny',
          message: `Access denied: File "${filePath}" is outside the project directory. You can only access files within ${normalizedProjectDir}`,
          interrupt: true,
        };
      }

      console.log(`[permissions] ✅ ✅ ✅ ALLOWED ${toolName}: ${filePath}`);
    }

    // 2️⃣ SEARCH OPERATIONS - Restrict to project directory
    if (['Glob', 'Grep'].includes(toolName)) {
      const searchPath = input.path as string | undefined;

      if (searchPath && !isWithinProject(searchPath)) {
        console.warn(`[permissions] ❌ ❌ ❌ DENIED ${toolName} - Search outside project boundary`);
        console.warn(`[permissions]   Attempted: ${searchPath}`);
        console.warn(`[permissions]   Allowed:   ${normalizedProjectDir}`);
        return {
          behavior: 'deny',
          message: `Search denied: Path "${searchPath}" is outside the project directory. You can only search within ${normalizedProjectDir}`,
          interrupt: true,
        };
      }

      console.log(`[permissions] ✅ ALLOWED ${toolName}: ${searchPath || 'current directory'}`);
    }

    // 3️⃣ BASH COMMANDS - Block dangerous operations
    if (toolName === 'Bash') {
      const command = input.command as string;
      console.log(`[permissions]   🔧 Bash command: ${command}`);

      // Block dangerous command patterns
      const dangerousPatterns = [
        { pattern: /rm\s+-rf\s+[\/~]/, message: 'Recursive deletion of root or home directory' },
        { pattern: /sudo/, message: 'Sudo commands' },
        { pattern: /chmod\s+777/, message: 'Insecure permission changes' },
        { pattern: />\s*\/dev\/sd/, message: 'Writing to disk devices' },
        { pattern: /dd\s+if=/, message: 'Direct disk operations' },
        { pattern: /mkfs/, message: 'Filesystem formatting' },
        { pattern: /shutdown|reboot/, message: 'System power commands' },
      ];

      for (const { pattern, message } of dangerousPatterns) {
        if (pattern.test(command)) {
          console.warn(`[permissions] ❌ ❌ ❌ BLOCKED dangerous bash command`);
          console.warn(`[permissions]   Reason: ${message}`);
          console.warn(`[permissions]   Command: ${command}`);
          return {
            behavior: 'deny',
            message: `Command blocked for safety: ${message}. Command: "${command}"`,
            interrupt: true,
          };
        }
      }

      // Block cd commands that escape project directory
      const cdMatch = command.match(/cd\s+([^\s;|&]+)/);
      if (cdMatch) {
        const targetPath = cdMatch[1];
        if (!isWithinProject(targetPath)) {
          console.warn(`[permissions] ❌ ❌ ❌ BLOCKED cd outside project`);
          console.warn(`[permissions]   Target: ${targetPath}`);
          console.warn(`[permissions]   Command: ${command}`);
          return {
            behavior: 'deny',
            message: `Cannot change directory outside project. You are restricted to ${normalizedProjectDir}`,
            interrupt: false, // Let Claude try another approach
          };
        }
      }

      console.log(`[permissions] ✅ ✅ ✅ ALLOWED bash: ${command.length > 100 ? command.slice(0, 100) + '...' : command}`);
    }

    // 4️⃣ WEB ACCESS - Allow (useful for downloading packages, docs, etc.)
    if (['WebFetch', 'WebSearch'].includes(toolName)) {
      // Web access is allowed - Claude may need to fetch documentation or packages
      const url = input.url || input.query;
      console.log(`[permissions] ✅ ALLOWED ${toolName}: ${url || 'N/A'}`);
    }

    // 5️⃣ SUBAGENTS - Inherit parent restrictions
    if (toolName === 'Task' || toolName === 'Agent') {
      console.log(`[permissions] ✅ ALLOWED subagent: ${input.description}`);
      console.log(`[permissions]   (Subagent will inherit same security restrictions)`);
      // Subagents inherit the same permission handler
    }

    // 6️⃣ OTHER TOOLS - Log and allow
    if (!['Read', 'Write', 'Edit', 'NotebookEdit', 'Glob', 'Grep', 'Bash', 'WebFetch', 'WebSearch', 'Task', 'Agent'].includes(toolName)) {
      console.log(`[permissions] ✅ ALLOWED ${toolName} (non-filesystem tool)`);
    }

    // Default: Allow all other operations
    console.log(`[permissions] ✅ Final decision: ALLOW`);
    return { behavior: 'allow', updatedInput: input };
  };
}
