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
 * Extract balanced JSON from text starting at a given position
 */
function extractBalancedJson(text: string, startPos: number): string | null {
  let braceCount = 0;
  let started = false;
  
  for (let i = startPos; i < text.length; i++) {
    if (text[i] === '{') {
      braceCount++;
      started = true;
    } else if (text[i] === '}') {
      braceCount--;
      if (braceCount === 0 && started) {
        return text.slice(startPos, i + 1);
      }
    }
  }
  
  return null;
}

/**
 * Extract GitHub result from agent response text.
 * Supports two formats:
 * 1. GITHUB_RESULT:{...} - explicit marker from skill
 * 2. gh repo view JSON output - {"url":"...","name":"...","owner":{...}}
 * 
 * Returns null if no valid result is found.
 */
export function parseGitHubResult(content: string): GitHubResultPayload | null {
  if (!content) return null;
  
  // First, try to find explicit GITHUB_RESULT: marker
  const marker = 'GITHUB_RESULT:';
  const markerIndex = content.indexOf(marker);
  
  if (markerIndex !== -1) {
    const afterMarker = content.slice(markerIndex + marker.length).trim();
    
    if (afterMarker.startsWith('{')) {
      const jsonStr = extractBalancedJson(afterMarker, 0);
      if (jsonStr) {
        try {
          const payload = JSON.parse(jsonStr) as GitHubResultPayload;
          if (typeof payload.success === 'boolean' && payload.action) {
            return payload;
          }
        } catch (e) {
          console.warn('[github-parser] Failed to parse GITHUB_RESULT JSON:', e);
        }
      }
    }
  }
  
  // Second, try to find gh repo view JSON output: {"url":"https://github.com/...","name":"...","owner":{"login":"..."}}
  // This is the actual output from `gh repo view --json url,name,owner`
  const ghRepoPattern = /"url"\s*:\s*"(https:\/\/github\.com\/[^"]+)"/;
  const urlMatch = content.match(ghRepoPattern);
  
  if (urlMatch) {
    // Find the JSON object containing this URL
    const urlIndex = content.indexOf(urlMatch[0]);
    // Search backwards for the opening brace
    let jsonStart = urlIndex;
    for (let i = urlIndex - 1; i >= 0; i--) {
      if (content[i] === '{') {
        jsonStart = i;
        break;
      }
      // Stop if we hit a newline without finding a brace
      if (content[i] === '\n') break;
    }
    
    if (jsonStart < urlIndex) {
      const jsonStr = extractBalancedJson(content, jsonStart);
      if (jsonStr) {
        try {
          const ghOutput = JSON.parse(jsonStr) as {
            url?: string;
            name?: string;
            owner?: { login?: string } | string;
          };
          
          if (ghOutput.url && ghOutput.name) {
            // Extract owner from URL or owner field
            let ownerLogin: string | undefined;
            if (typeof ghOutput.owner === 'object' && ghOutput.owner?.login) {
              ownerLogin = ghOutput.owner.login;
            } else if (typeof ghOutput.owner === 'string') {
              ownerLogin = ghOutput.owner;
            } else {
              // Extract from URL: https://github.com/owner/repo
              const urlParts = ghOutput.url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
              if (urlParts) {
                ownerLogin = urlParts[1];
              }
            }
            
            if (ownerLogin) {
              console.log('[github-parser] Parsed gh repo view output:', { url: ghOutput.url, owner: ownerLogin, name: ghOutput.name });
              return {
                success: true,
                repo: `${ownerLogin}/${ghOutput.name}`,
                url: ghOutput.url,
                branch: 'main', // Default, will be updated if we find branch info
                action: 'setup',
              };
            }
          }
        } catch (e) {
          // Not valid JSON, continue
        }
      }
    }
  }
  
  return null;
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
