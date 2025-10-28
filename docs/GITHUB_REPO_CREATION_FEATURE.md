# GitHub Repository Creation Feature

## Overview
This feature adds a button to the preview pane that allows users to create a GitHub repository for their project directly from the SentryVibe interface.

## User Experience

### Button Location
The "Create Repo" button appears to the left of the "Start" button in the preview pane.

### Button States
1. **Create Repo** (idle) - Gray button, clickable when no build is active
2. **Creating...** (in progress) - Gray button with pulsing icon, disabled
3. **View Repo** (completed) - Purple button, opens the GitHub repository in a new tab

### Flow
1. User clicks "Create Repo" button
2. Button changes to "Creating..." state
3. Agent (using selected model from tags) executes GitHub repo creation
4. System polls every 3 seconds for completion
5. When complete, button changes to "View Repo"
6. User can click "View Repo" to open the GitHub repository

## Technical Implementation

### Components Modified
- **PreviewPanel.tsx**: Added GitHub button, state management, and handlers

### API Endpoints Created
- **POST `/api/projects/[id]/github-repo`**: Triggers GitHub repo creation
- **GET `/api/projects/[id]/github-repo`**: Fetches status and auto-extracts repo URL from messages
- **PATCH `/api/projects/[id]/github-repo`**: Manually updates GitHub metadata

### Agent Prompt
The system sends a detailed prompt to the selected agent (prototyped with Claude Code):

```
Create a new GitHub repository for this project using the gh CLI with these requirements:
1. Use the gh CLI to create a new repository in the default organization/user
2. Name the repository based on the project name (project-slug)
3. Initialize it as a public repository
4. Add all current project files to git (if not already initialized)
5. Create an initial commit with message "Initial commit from SentryVibe"
6. Push the code to the new GitHub repository
7. IMPORTANT: At the end, output the repository URL in this exact format: "REPO_URL: https://github.com/username/repo-name"
```

### Data Storage
GitHub metadata is stored in the project's `generationState` JSON field:

```typescript
interface GithubRepoMetadata {
  status: 'pending' | 'creating' | 'completed' | 'failed';
  repoUrl?: string;
  buildId?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}
```

### URL Extraction
The GET endpoint automatically parses recent messages for the pattern:
```
REPO_URL: https://github.com/username/repo-name
```

When found, it:
1. Extracts the URL
2. Updates status to "completed"
3. Stores the repo URL in the database

## Prerequisites

### User Requirements
- GitHub CLI (`gh`) must be installed and authenticated on the runner machine
- User must have permissions to create repositories

### System Requirements
- Runner must be online and connected
- Project must exist and be accessible

## Usage Example

1. Build a project in SentryVibe
2. Once the project is created, click "Create Repo" in the preview pane
3. Wait for the agent to complete the GitHub repo creation
4. Click "View Repo" to see your new repository on GitHub

## Limitations & Future Improvements

### Current Limitations
1. **Manual Detection**: Relies on polling and message parsing
2. **No Progress Updates**: User only sees "Creating..." state
3. **Error Handling**: Limited error messages if creation fails
4. **Single Attempt**: No retry mechanism

### Potential Improvements
1. **Real-time Updates**: Use WebSocket for live status updates
2. **Progress Indicators**: Show each step of the repo creation
3. **Error Recovery**: Better error messages and retry options
4. **Configuration Options**: Allow users to specify:
   - Repository name
   - Public/private visibility
   - Repository description
   - Initial README content
5. **Multi-Platform Support**: Add support for GitLab, Bitbucket
6. **Webhook Integration**: Direct callback from agent to update status

## Testing

### Manual Testing Steps
1. Create a new project in SentryVibe
2. Ensure gh CLI is authenticated (`gh auth status`)
3. Click "Create Repo" button
4. Monitor terminal output for agent activity
5. Verify button changes to "View Repo"
6. Click "View Repo" to verify the repository was created
7. Check that the repository contains the project files

### Edge Cases to Test
- Build already in progress
- GitHub CLI not authenticated
- Network connectivity issues
- Repository name conflicts
- Permission issues

## Security Considerations

1. **Authentication**: Uses runner's gh CLI authentication
2. **Permissions**: Respects user's GitHub permissions
3. **Visibility**: Currently creates public repositories
4. **Code Access**: Agent has access to all project files

## Model Compatibility

This feature has been prototyped with:
- ✅ Claude Code (claude-sonnet-4-5, claude-haiku-4-5)

Should work with:
- ⚠️ OpenAI Codex (untested)
- ⚠️ Other models that support gh CLI commands

## Branch Information
- **Feature Branch**: `feature/github-repo-creation`
- **Based On**: `main`
- **Status**: Prototype/POC

## Related Files
- `apps/sentryvibe/src/app/api/projects/[id]/github-repo/route.ts` - API endpoints
- `apps/sentryvibe/src/components/PreviewPanel.tsx` - UI component

