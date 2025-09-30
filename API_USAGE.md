# AI Generate API - Usage Guide

## Overview

A clean, modern AI-powered code generator using the Vercel AI SDK with Claude Sonnet 4.5. The AI can create files, run bash commands, edit text, and search the web!

## Features

✅ **Smart Conversational Interface** - Chat naturally with Claude
✅ **Real-Time Streaming** - See responses as they're generated
✅ **Bash Tool** - Execute shell commands and create files
✅ **Text Editor Tool** - Create, edit, and manipulate text files
✅ **Web Search Tool** - Search the web for up-to-date information
✅ **Full Tool Visibility** - See exactly what tools are being used

## Quick Start

1. **Start the dev server:**
   ```bash
   npm run dev
   ```

2. **Visit the UI:**
   ```
   http://localhost:3000/generate
   ```

3. **Try it out!** Ask Claude to:
   - "Create a hello.txt file with 'Hello World' using bash"
   - "Use the text editor to create a simple Express server"
   - "Search for Next.js 15 new features and summarize them"

## API Endpoint

### POST `/api/generate`

The API follows the standard [AI SDK chat pattern](https://ai-sdk.dev/docs/getting-started/nextjs-app-router) for Next.js App Router.

**Request Body:**
```json
{
  "messages": [
    {
      "id": "msg-1",
      "role": "user",
      "parts": [
        {
          "type": "text",
          "text": "Create a hello.txt file"
        }
      ]
    }
  ]
}
```

**Response:**
- Streamed UI message response
- Automatically handled by the `useChat` hook
- Includes text, tool calls, and tool results

## Using the `useChat` Hook

The frontend uses the AI SDK's `useChat` hook which handles all the complexity:

```typescript
'use client';

import { useChat } from '@ai-sdk/react';

export default function MyPage() {
  const { messages, sendMessage, isLoading } = useChat({
    api: '/api/generate',
  });

  // messages automatically includes:
  // - Text responses
  // - Tool calls (bash, text_editor, web_search)
  // - Tool results
  // All streamed in real-time!

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, i) => {
            switch (part.type) {
              case 'text':
                return <div>{part.text}</div>;
              case 'tool-bash':
                return <div>Bash: {part.input.command}</div>;
              case 'tool-text_editor':
                return <div>Editor: {part.input.command}</div>;
              case 'tool-web_search':
                return <div>Search: {part.input.query}</div>;
            }
          })}
        </div>
      ))}
      
      <form onSubmit={(e) => {
        e.preventDefault();
        sendMessage({ text: input });
      }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

## Tool Capabilities

### 🔧 Bash Tool
Execute shell commands in a sandboxed environment:
- Create files and directories
- Run scripts
- System operations
- File management

**Example:**
```
"Create a package.json file using bash"
```

### 📝 Text Editor Tool
Advanced file manipulation:
- `view` - View file contents
- `create` - Create new files
- `str_replace` - Replace text in files
- `insert` - Insert lines at specific positions
- `undo_edit` - Undo previous edits

**Example:**
```
"Use the text editor to create a React component in Button.tsx"
```

### 🔍 Web Search Tool
Search the web for current information:
- Up to 5 searches per request
- Returns URLs, titles, and content
- Configurable blocked domains

**Example:**
```
"Search for the latest React 19 features and summarize them"
```

## Message Structure

Messages use the AI SDK's UIMessage format with parts:

```typescript
{
  id: string;
  role: 'user' | 'assistant';
  parts: Array<
    | { type: 'text'; text: string }
    | { type: 'tool-bash'; input: { command: string }; output?: any }
    | { type: 'tool-text_editor'; input: any; output?: any }
    | { type: 'tool-web_search'; input: { query: string }; output?: any }
  >;
}
```

## Server-Side Logging

Tool activity is logged to the server console:

```bash
🔧 Tool Calls: [
  {
    "toolName": "bash",
    "input": { "command": "echo 'Hello World' > hello.txt" }
  }
]

✅ Tool Results: [
  {
    "toolName": "bash",
    "output": { "stdout": "", "stderr": "", "exit_code": 0 }
  }
]
```

## Architecture

This implementation follows the [AI SDK Next.js App Router pattern](https://ai-sdk.dev/docs/getting-started/nextjs-app-router):

1. **Backend** (`/api/generate/route.ts`)
   - Uses `streamText` with Anthropic provider
   - Configures bash, text editor, and web search tools
   - Returns `toUIMessageStreamResponse()` for automatic streaming

2. **Frontend** (`/generate/page.tsx`)
   - Uses `useChat` hook for state management
   - Automatically handles streaming
   - Renders tool calls and results

## Why This Approach?

✅ **Simpler** - No manual SSE handling
✅ **Cleaner** - Built-in message format and streaming
✅ **Type-Safe** - Full TypeScript support
✅ **Battle-Tested** - Uses Vercel's production-ready patterns
✅ **Automatic** - Handles retries, errors, and state management

## Security Note

⚠️ **Important**: The bash and text editor tools have file system access:
- Monitor the server logs for tool activity
- Use in a safe development environment
- Add authentication for production
- Consider sandboxing or limiting permissions

## Example Queries

- "Create a simple HTTP server in Node.js"
- "Search for TypeScript best practices and create a README"
- "Make a React component with a button and counter"
- "Create a package.json for a Next.js app with TypeScript"
- "Write a Python script that reads a CSV file"

---

Built with [Vercel AI SDK](https://ai-sdk.dev) and [Anthropic Claude](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic) 🚀