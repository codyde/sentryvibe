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

## Prerequisites Check

Before creating a repository, verify the environment:

1. **Check gh CLI is installed:**
   ```bash
   gh --version
   ```
   If not installed, inform the user:
   - macOS: `brew install gh`
   - Linux: `sudo apt install gh` or `sudo dnf install gh`
   - Windows: `winget install GitHub.cli`

2. **Check authentication status:**
   ```bash
   gh auth status
   ```
   If not authenticated, guide the user to run:
   ```bash
   gh auth login
   ```
   They should select "GitHub.com" and authenticate via browser.

## Repository Creation Flow

When the user wants to set up GitHub for their project:

1. **Navigate to the project directory** (use the project path from context)

2. **Initialize git if needed:**
   ```bash
   git init
   ```

3. **Create initial commit if no commits exist:**
   ```bash
   git add .
   git commit -m "Initial commit from SentryVibe"
   ```

4. **Create the GitHub repository and push:**
   ```bash
   gh repo create {project-name} --public --source=. --remote=origin --push
   ```
   
   Use the project name (slugified) as the repository name.

5. **Verify the setup:**
   ```bash
   git remote -v
   ```

6. **Get repository information:**
   ```bash
   gh repo view --json url,defaultBranchRef,owner
   ```

## Response Format

After successful setup, provide:
- The full repository URL (e.g., https://github.com/username/repo-name)
- The default branch name (usually "main")
- Confirmation that the code has been pushed

**Important:** The system will automatically update the project database with:
- `githubRepo`: owner/repo-name format
- `githubUrl`: full repository URL
- `githubBranch`: default branch name
- `githubLastPushedAt`: current timestamp

## Push Changes Flow

When the user wants to push changes to an existing repository:

1. **Check for changes:**
   ```bash
   git status
   ```

2. **Stage and commit changes:**
   ```bash
   git add .
   git commit -m "Update from SentryVibe"
   ```

3. **Push to remote:**
   ```bash
   git push origin main
   ```

4. **Report the result** including number of files changed.

## Sync Repository Info Flow

When syncing repository information:

1. **Fetch latest repo data:**
   ```bash
   gh repo view --json openIssues,pullRequests,stargazerCount,forkCount,description
   ```

2. **Get recent commits:**
   ```bash
   git log --oneline -5
   ```

3. **Report the information** for display in the UI.

## Error Handling

Handle these common errors gracefully:

- **gh CLI not installed:** Provide installation instructions for their OS
- **Not authenticated:** Guide them through `gh auth login`
- **Repository name taken:** Suggest adding a suffix or ask for a new name
- **No internet connection:** Inform them to check their connection
- **Permission denied:** Check if they have write access to the organization
- **Not a git repository:** Initialize git first with `git init`

## Security Notes

- Never store or log GitHub tokens
- Use `gh` CLI which manages authentication securely
- Don't expose private repository contents in logs
