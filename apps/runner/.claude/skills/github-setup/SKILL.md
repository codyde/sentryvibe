---
name: github-setup
description: |
  Set up GitHub repository integration for a SentryVibe project.
  Use this skill when the user wants to:
  - Connect their project to GitHub
  - Create a new GitHub repository for their project
  - Push their project code to GitHub
  - Check GitHub CLI authentication status
  
  This skill uses the `gh` CLI tool for local-first GitHub operations.
---

# GitHub Repository Setup Skill

You are helping set up GitHub integration for a SentryVibe project. This skill uses the `gh` CLI tool which authenticates locally on the user's machine.

## CRITICAL: Structured Output Requirement

After completing ANY GitHub operation, you MUST end your response with a JSON block in this exact format:

```json
GITHUB_RESULT:{"success":true,"repo":"owner/repo-name","url":"https://github.com/owner/repo-name","branch":"main","action":"setup"}
```

The JSON must be on a single line, prefixed with `GITHUB_RESULT:` and no spaces before the JSON.

### Result Schema

```typescript
{
  success: boolean;        // Whether the operation succeeded
  repo?: string;           // Repository in "owner/repo" format
  url?: string;            // Full GitHub URL
  branch?: string;         // Default branch name (usually "main")
  action: "setup" | "push" | "sync" | "error";  // What action was performed
  error?: string;          // Error message if success is false
  filesChanged?: number;   // For push operations
  commitSha?: string;      // For push operations
}
```

## Prerequisites Check

Before creating a repository, verify the environment:

1. **Check gh CLI is installed:**
   ```bash
   gh --version
   ```
   If not installed, return error result:
   ```json
   GITHUB_RESULT:{"success":false,"action":"error","error":"gh CLI not installed. Install with: brew install gh (macOS) or sudo apt install gh (Linux)"}
   ```

2. **Check authentication status:**
   ```bash
   gh auth status
   ```
   If not authenticated, return error result:
   ```json
   GITHUB_RESULT:{"success":false,"action":"error","error":"Not authenticated with GitHub. Run: gh auth login"}
   ```

## Repository Creation Flow

When the user wants to set up GitHub for their project:

1. **Initialize git if needed:**
   ```bash
   git init
   ```

2. **Create initial commit if no commits exist:**
   ```bash
   git add .
   git commit -m "Initial commit from SentryVibe"
   ```

3. **Create the GitHub repository and push:**
   
   Check the user's request to determine visibility:
   - If they say "public repository" → use `--public`
   - If they say "private repository" → use `--private`
   - Default to `--public` if not specified
   
   ```bash
   # For public repository:
   gh repo create {project-name} --public --source=. --remote=origin --push
   
   # For private repository:
   gh repo create {project-name} --private --source=. --remote=origin --push
   ```
   
   Use the project name (slugified) as the repository name.

4. **Get repository information:**
   ```bash
   gh repo view --json url,name,owner
   ```

5. **Get the default branch:**
   ```bash
   git branch --show-current
   ```

6. **Return structured result:**
   ```json
   GITHUB_RESULT:{"success":true,"repo":"username/project-name","url":"https://github.com/username/project-name","branch":"main","action":"setup"}
   ```

## Push Changes Flow

When the user wants to push changes to an existing repository:

1. **Stage and commit changes:**
   ```bash
   git add .
   git commit -m "Update from SentryVibe"
   ```

2. **Push to remote:**
   ```bash
   git push origin main
   ```

3. **Get the commit info:**
   ```bash
   git rev-parse --short HEAD
   ```

4. **Return structured result:**
   ```json
   GITHUB_RESULT:{"success":true,"action":"push","commitSha":"abc1234","filesChanged":5}
   ```

## Error Handling

Always return a structured error result:

```json
GITHUB_RESULT:{"success":false,"action":"error","error":"Description of what went wrong"}
```

Common errors to handle:
- **gh CLI not installed:** Provide installation instructions
- **Not authenticated:** Guide them through `gh auth login`
- **Repository name taken:** Suggest adding a suffix
- **No internet connection:** Inform them to check their connection
- **Permission denied:** Check write access

## Security Notes

- Never store or log GitHub tokens
- Use `gh` CLI which manages authentication securely
- Don't expose private repository contents in logs

## Cleanup After Success

After successfully setting up the repository, delete this skill file to keep the project clean:

```bash
rm -rf .claude/skills/github-setup
```

If the `.claude/skills` directory is now empty, remove it too:

```bash
rmdir .claude/skills 2>/dev/null
rmdir .claude 2>/dev/null
```

## Example Complete Response

After successfully creating a repository, your response should look like:

```
I've set up the GitHub repository for your project. Here's what I did:

1. Initialized git repository
2. Created initial commit with all project files
3. Created public GitHub repository
4. Pushed code to GitHub
5. Cleaned up setup files

Your repository is now live at: https://github.com/username/project-name

GITHUB_RESULT:{"success":true,"repo":"username/project-name","url":"https://github.com/username/project-name","branch":"main","action":"setup"}
```
