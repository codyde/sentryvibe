# SentryVibe MCP Server

An unauthenticated Model Context Protocol (MCP) server providing AI-powered tools for MVP development planning.

## Endpoint

**URL**: `http://localhost:3000/api/mcp`

**Transport**: Streamable HTTP (via mcp-handler)

## Available Tools

### 1. template-selection

Selects the best project template based on an application description.

**Input Schema:**
```typescript
{
  applicationDescription: string; // Min 10 characters
}
```

**Returns:**
```json
{
  "templateId": "nextjs-fullstack",
  "templateName": "Next.js 15 Full-Stack",
  "repository": "github:codyde/template-nextjs15",
  "degitCommand": "npx degit codyde/template-nextjs15#main my-app",
  "confidence": 100,
  "rationale": "Selected Next.js 15 Full-Stack based on keyword matches: authentication, database, saas...",
  "techStack": {
    "framework": "next",
    "version": "15.x",
    "language": "typescript",
    "styling": "tailwind",
    "uiLibrary": "shadcn"
  }
}
```

**Example Usage:**
```json
{
  "applicationDescription": "Build a SaaS dashboard with user authentication and database"
}
```

### 2. todo-list-tool

Formats AI-generated task descriptions into structured TodoItem objects. This is a **formatter/validator**, not a task generator - the AI generates the tasks, and this tool ensures they're in the proper format.

**Input Schema:**
```typescript
{
  tasks: (string | { content: string; status?: "pending" | "in_progress" | "completed" })[];
}
```

**Returns:**
```json
{
  "todos": [
    {
      "content": "Create user authentication system",
      "status": "in_progress",
      "activeForm": "Creating user authentication system"
    },
    {
      "content": "Build dashboard UI",
      "status": "pending",
      "activeForm": "Building dashboard UI"
    }
  ],
  "summary": "Formatted 2 tasks into TodoItem structure",
  "counts": {
    "inProgress": 1,
    "pending": 1,
    "completed": 0
  }
}
```

**Example Usage:**
```json
{
  "tasks": [
    "Create API routes",
    "Build user interface",
    { "content": "Set up deployment", "status": "completed" }
  ]
}
```

**Features:**
- Accepts simple string arrays or objects with optional status
- Auto-generates `activeForm` (present continuous) from task content
- First task defaults to `in_progress`, others to `pending`
- Respects custom status when provided

### 3. todo-update-tool

Updates the status of existing TodoItem objects. Pass the complete updated todo list and this tool validates and normalizes it.

**Input Schema:**
```typescript
{
  todos: Array<{
    content: string;
    status: "pending" | "in_progress" | "completed";
    activeForm?: string; // Optional, will be auto-generated if missing
  }>;
}
```

**Returns:**
```json
{
  "todos": [
    {
      "content": "Create user authentication system",
      "status": "completed",
      "activeForm": "Creating user authentication system"
    },
    {
      "content": "Build dashboard UI",
      "status": "in_progress",
      "activeForm": "Building dashboard UI"
    },
    {
      "content": "Add payment integration",
      "status": "pending",
      "activeForm": "Adding payment integration"
    }
  ],
  "summary": "Updated 3 todos",
  "counts": {
    "inProgress": 1,
    "pending": 1,
    "completed": 1
  },
  "warnings": [] // Optional warnings (e.g., multiple tasks in_progress)
}
```

**Example Usage:**
```json
{
  "todos": [
    { "content": "Create API routes", "status": "completed" },
    { "content": "Build user interface", "status": "in_progress" },
    { "content": "Add authentication", "status": "pending" }
  ]
}
```

**Features:**
- Validates and normalizes the entire todo list
- Auto-generates missing `activeForm` fields
- Provides status counts for tracking progress
- Warns if multiple tasks are marked `in_progress`
- Stateless - just send the updated list

## Available Templates

1. **react-vite** - Simple React + Vite for basic SPAs
2. **nextjs-fullstack** - Next.js 15 with App Router, auth, APIs
3. **vite-react-node** - React frontend + Express backend
4. **astro-static** - Static site generator for blogs/docs

## Integration with Claude Code SDK / Codex SDK

To use these tools as MCP resources in your agent configuration:

### Claude Code SDK
```typescript
import { ClaudeAgent } from '@anthropic-ai/claude-agent-sdk';

const agent = new ClaudeAgent({
  mcpServers: {
    sentryvibe: {
      url: 'http://localhost:3000/api/mcp'
    }
  }
});
```

### Codex SDK
```typescript
import { CodexAgent } from '@openai/codex-sdk';

const agent = new CodexAgent({
  mcpServers: [{
    name: 'sentryvibe',
    url: 'http://localhost:3000/api/mcp'
  }]
});
```

## Testing Locally

Start the Next.js dev server:
```bash
cd apps/sentryvibe
pnpm dev
```

The MCP server will be available at: `http://localhost:3000/api/mcp`

## Implementation Details

- Built with [mcp-handler](https://github.com/vercel/mcp-handler)
- Uses Streamable HTTP transport (no Redis required)
- Stateless design for scalability
- Template configuration loaded from `templates.json`
- Smart keyword matching for template selection
- Context-aware todo formatting with activeForm generation

