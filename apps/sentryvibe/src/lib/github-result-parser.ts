/**
 * Parser for extracting structured GitHub results from agent responses.
 * 
 * The agent skill is instructed to output results in this format:
 * GITHUB_RESULT:{"success":true,"repo":"owner/repo","url":"https://github.com/owner/repo","branch":"main","action":"setup"}
 */

export interface GitHubResultPayload {
  success: boolean;
  repo?: string;           // "owner/repo" format
  url?: string;            // Full GitHub URL
  branch?: string;         // Default branch (usually "main")
  action: "setup" | "push" | "sync" | "error";
  error?: string;          // Error message if success is false
  filesChanged?: number;   // For push operations
  commitSha?: string;      // For push operations
}

/**
 * Extract GitHub result from agent response text.
 * Returns null if no valid result is found.
 */
export function parseGitHubResult(content: string): GitHubResultPayload | null {
  if (!content) return null;
  
  // Look for GITHUB_RESULT: prefix followed by JSON
  const pattern = /GITHUB_RESULT:\s*(\{[^}]+\})/;
  const match = content.match(pattern);
  
  if (!match || !match[1]) {
    return null;
  }
  
  try {
    const payload = JSON.parse(match[1]) as GitHubResultPayload;
    
    // Validate required fields
    if (typeof payload.success !== 'boolean' || !payload.action) {
      console.warn('[github-parser] Invalid payload structure:', payload);
      return null;
    }
    
    return payload;
  } catch (e) {
    console.error('[github-parser] Failed to parse GitHub result JSON:', e);
    return null;
  }
}

/**
 * Check if content contains a GitHub result marker.
 * Useful for quick detection before full parsing.
 */
export function hasGitHubResult(content: string): boolean {
  return content?.includes('GITHUB_RESULT:') ?? false;
}

/**
 * Update project's GitHub status via API.
 * Returns true if update was successful.
 */
export async function updateProjectGitHub(
  projectId: string,
  result: GitHubResultPayload
): Promise<boolean> {
  if (!result.success || result.action === 'error') {
    console.warn('[github-parser] Skipping update for unsuccessful result');
    return false;
  }
  
  try {
    const body: Record<string, unknown> = {};
    
    if (result.repo) body.repo = result.repo;
    if (result.url) body.url = result.url;
    if (result.branch) body.branch = result.branch;
    
    // For push operations, update lastPushedAt
    if (result.action === 'push' || result.action === 'setup') {
      body.lastPushedAt = new Date().toISOString();
    }
    
    // Add metadata if available
    if (result.commitSha || result.filesChanged !== undefined) {
      body.meta = {
        lastCommitSha: result.commitSha,
        filesChanged: result.filesChanged,
        lastAction: result.action,
        lastActionAt: new Date().toISOString(),
      };
    }
    
    const response = await fetch(`/api/projects/${projectId}/github`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      console.error('[github-parser] Failed to update project GitHub:', response.statusText);
      return false;
    }
    
    console.log('[github-parser] Successfully updated project GitHub status');
    return true;
  } catch (e) {
    console.error('[github-parser] Error updating project GitHub:', e);
    return false;
  }
}

/**
 * Parse agent response and update project if GitHub result found.
 * Combines parsing and updating in one call for convenience.
 */
export async function processAgentGitHubResponse(
  projectId: string,
  content: string,
  onSuccess?: (result: GitHubResultPayload) => void
): Promise<boolean> {
  const result = parseGitHubResult(content);
  
  if (!result) {
    return false;
  }
  
  console.log('[github-parser] Found GitHub result:', result);
  
  const updated = await updateProjectGitHub(projectId, result);
  
  if (updated && onSuccess) {
    onSuccess(result);
  }
  
  return updated;
}
