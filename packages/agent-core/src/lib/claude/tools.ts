import { z } from 'zod';

// Accept anything by default – Claude CLI already validates tool payloads.
const genericInput = z.any();
const genericObject = z.record(z.string(), z.any());

type ClaudeToolDescriptor = {
  description?: string;
  type?: 'dynamic';
  inputSchema: z.ZodType;
};

const dynamicMcpTool: ClaudeToolDescriptor = {
  description: 'Generic MCP tool passthrough',
  type: 'dynamic',
  inputSchema: genericObject,
};

const fallbackTool: ClaudeToolDescriptor = {
  description: 'Fallback Claude CLI tool',
  inputSchema: genericInput,
};

const builtinTools: Record<string, ClaudeToolDescriptor> = {
  Agent: {
    description: 'Launches a nested Claude agent',
    inputSchema: genericObject,
  },
  Bash: {
    description: 'Execute shell commands via Claude CLI',
    inputSchema: genericObject,
  },
  BashOutput: {
    description: 'Fetch output from a background bash process',
    inputSchema: genericObject,
  },
  ExitPlanMode: {
    description: 'Exit plan/approval mode with a summary',
    inputSchema: genericObject,
  },
  Read: {
    description: 'Read file contents',
    inputSchema: genericObject,
  },
  Write: {
    description: 'Write entire file contents',
    inputSchema: genericObject,
  },
  Edit: {
    description: 'Edit part of a file by replacing text',
    inputSchema: genericObject,
  },
  Glob: {
    description: 'Match files using glob patterns',
    inputSchema: genericObject,
  },
  Grep: {
    description: 'Search files for a regex pattern',
    inputSchema: genericObject,
  },
  KillShell: {
    description: 'Stop a running bash session',
    inputSchema: genericObject,
  },
  ListMcpResources: {
    description: 'Enumerate MCP resources',
    inputSchema: genericObject,
  },
  Mcp: {
    description: 'Invoke an MCP tool',
    inputSchema: genericObject,
  },
  NotebookEdit: {
    description: 'Edit Jupyter notebooks',
    inputSchema: genericObject,
  },
  ReadMcpResource: {
    description: 'Read a particular MCP resource',
    inputSchema: genericObject,
  },
  TimeMachine: {
    description: 'Rewind conversation with a course correction',
    inputSchema: genericObject,
  },
  TodoWrite: {
    description: 'Emit TODO status updates',
    inputSchema: genericObject,
  },
  WebFetch: {
    description: 'Fetch and summarize a URL',
    inputSchema: genericObject,
  },
  WebSearch: {
    description: 'Search the web with constraints',
    inputSchema: genericObject,
  },
  MultipleChoiceQuestion: {
    description: 'Ask the user a multiple choice question',
    inputSchema: genericObject,
  },
  // Common aliases seen in telemetry/logs
  LS: {
    description: 'List files in the working directory',
    inputSchema: genericObject,
  },
  TodoRead: {
    description: 'Read TODO state emitted from runner',
    inputSchema: genericObject,
  },
};

const proxyHandler: ProxyHandler<Record<string, ClaudeToolDescriptor>> = {
  get(target, prop) {
    if (typeof prop !== 'string') {
      return Reflect.get(target, prop);
    }

    if (Reflect.has(target, prop)) {
      return Reflect.get(target, prop);
    }

    if (prop.startsWith('mcp__')) {
      return dynamicMcpTool;
    }

    return fallbackTool;
  },
  has(target, prop) {
    if (typeof prop === 'string') {
      if (Reflect.has(target, prop) || prop.startsWith('mcp__')) {
        return true;
      }
    }

    return Reflect.has(target, prop);
  },
  ownKeys(target) {
    return Reflect.ownKeys(target);
  },
  getOwnPropertyDescriptor(target, prop) {
    if (Reflect.has(target, prop)) {
      return Object.getOwnPropertyDescriptor(target, prop);
    }
    return undefined;
  },
};

export type ClaudeToolRegistry = Record<string, ClaudeToolDescriptor>;

export function createClaudeToolRegistry(): ClaudeToolRegistry {
  return new Proxy(builtinTools, proxyHandler);
}

export const CLAUDE_CLI_TOOL_REGISTRY = createClaudeToolRegistry();
