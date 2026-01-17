import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { 
  DEFAULT_CLAUDE_MODEL_ID,
  DEFAULT_OPENCODE_MODEL_ID,
  normalizeModelId,
  parseModelId,
} from "@sentryvibe/agent-core/types/agent";
import type { ClaudeModelId, OpenCodeModelId } from "@sentryvibe/agent-core/types/agent";
import { getOpenCodeClient, getOpenCodeUrl } from "@sentryvibe/opencode-client";
import * as Sentry from "@sentry/nextjs";
import * as os from 'os';
import * as path from 'path';
import { existsSync, mkdirSync } from 'fs';

/**
 * Check if OpenCode SDK should be used
 * Default: Claude Agent SDK
 * Set USE_OPENCODE_SDK=1 to enable OpenCode multi-provider support
 */
function useOpenCodeSDK(): boolean {
  return process.env.USE_OPENCODE_SDK === '1' && !!process.env.OPENCODE_URL;
}

/**
 * Get a clean env object with only string values (filter out undefined)
 * and ensure PATH is included
 */
function getCleanEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  // Ensure PATH is set - use common paths as fallback
  if (!env.PATH) {
    env.PATH = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
  }
  return env;
}

/**
 * Ensure a directory exists
 */
function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// Map model IDs to Claude Agent SDK model names  
const MODEL_MAP: Record<string, string> = {
  'claude-haiku-4-5': 'claude-sonnet-4-5',
  'claude-sonnet-4-5': 'claude-sonnet-4-5', 
  'claude-opus-4-5': 'claude-opus-4-5',
};

function resolveModelName(modelId: string): string {
  return MODEL_MAP[modelId] || 'claude-sonnet-4-5';
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ProjectContext {
  id: string;
  name: string;
  slug: string;
  path: string;
  projectType: string | null;
  description: string | null;
}

export async function POST(req: Request) {
  const {
    messages,
    claudeModel,
    modelId, // New: OpenCode model format (provider/model)
    projectContext,
  }: { 
    messages: ChatMessage[]; 
    claudeModel?: ClaudeModelId;
    modelId?: OpenCodeModelId;
    projectContext?: ProjectContext;
  } = await req.json();
  
  const useOpenCode = useOpenCodeSDK();
  
  Sentry.logger.info(
    Sentry.logger.fmt`Processing chat messages ${{
      messageCount: messages.length,
      claudeModel,
      modelId,
      hasProjectContext: !!projectContext,
      useOpenCode,
    }}`
  );

  // Determine model to use
  const selectedModel = modelId 
    ? normalizeModelId(modelId)
    : claudeModel 
      ? normalizeModelId(claudeModel)
      : useOpenCode ? DEFAULT_OPENCODE_MODEL_ID : DEFAULT_CLAUDE_MODEL_ID;

  const selectedClaudeModel: ClaudeModelId =
    claudeModel === "claude-haiku-4-5" || claudeModel === "claude-sonnet-4-5" || claudeModel === "claude-opus-4-5"
      ? claudeModel
      : DEFAULT_CLAUDE_MODEL_ID;

  // Build system prompt based on whether we have project context
  let systemPrompt = "";
  if (projectContext) {
    systemPrompt = `You are a helpful coding assistant helping the user iterate on their existing project.

PROJECT CONTEXT:
- Name: ${projectContext.name}
- Type: ${projectContext.projectType || "Unknown"}
- Location: ${projectContext.path}
${projectContext.description ? `- Description: ${projectContext.description}` : ""}

IMPORTANT INSTRUCTIONS:
- This is a CHAT conversation about an EXISTING project
- The user is asking questions or requesting small iterations/clarifications
- Focus on understanding the current state and making precise, helpful suggestions
- If the user wants major architectural changes, suggest they use the "Build" tab instead
- Keep responses focused and conversational - this is a chat, not a full build process

You can help with:
- Answering questions about the code
- Explaining how things work
- Suggesting improvements and best practices
- Helping debug issues
- Providing code examples

Remember: This is an iterative chat about an existing project, not a full build session.`;
  } else {
    systemPrompt = `You are a helpful coding assistant. You can answer questions and help with code, but for creating new projects, the user should use the main interface.`;
  }

  // Build the conversation prompt from messages
  // The SDK expects a single prompt, so we'll format the conversation
  const lastUserMessage = messages.filter(m => m.role === 'user').pop();
  const conversationContext = messages
    .slice(0, -1) // All but the last message
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');
  
  const fullPrompt = conversationContext 
    ? `${systemPrompt}\n\nPrevious conversation:\n${conversationContext}\n\nUser: ${lastUserMessage?.content || ''}`
    : `${systemPrompt}\n\nUser: ${lastUserMessage?.content || ''}`;

  // Use temp directory for working directory
  const tempDir = path.join(os.tmpdir(), 'sentryvibe-chat');
  ensureDir(tempDir);

  const sdkOptions: Options = {
    model: resolveModelName(selectedClaudeModel),
    maxTurns: 1,
    tools: [], // Empty array disables all built-in tools for chat
    cwd: tempDir,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    includePartialMessages: true, // Enable streaming
    env: getCleanEnv(),
  };

  // Create streaming response
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (useOpenCode) {
          // Use OpenCode SDK with streaming via direct HTTP (matching runner pattern)
          const baseUrl = getOpenCodeUrl();
          const { provider: providerID, model: modelID } = parseModelId(selectedModel);
          
          // Build auth headers
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          const authToken = process.env.RUNNER_SHARED_SECRET;
          if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
          }
          
          let sessionId: string | null = null;
          let eventReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
          
          try {
            // Step 1: Create a session
            const sessionResponse = await fetch(`${baseUrl}/session`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ title: `Chat ${Date.now()}` }),
            });
            
            if (!sessionResponse.ok) {
              const error = await sessionResponse.text();
              throw new Error(`Failed to create OpenCode session: ${sessionResponse.status} ${error}`);
            }
            
            const session = await sessionResponse.json();
            sessionId = session.id;
            
            // Step 2: Subscribe to events (SSE stream)
            const eventResponse = await fetch(`${baseUrl}/event`, {
              headers: {
                ...headers,
                'Accept': 'text/event-stream',
              },
            });
            
            if (!eventResponse.ok) {
              throw new Error(`Failed to subscribe to events: ${eventResponse.status}`);
            }
            
            eventReader = eventResponse.body?.getReader() ?? null;
            if (!eventReader) {
              throw new Error('No response body reader for event stream');
            }
            
            // Step 3: Send the prompt (don't await - we'll stream the response)
            const promptPromise = fetch(`${baseUrl}/session/${sessionId}/message`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                model: { providerID, modelID },
                system: systemPrompt,
                parts: [{ type: 'text', text: lastUserMessage?.content || '' }],
              }),
            });
            
            // Step 4: Process event stream
            const decoder = new TextDecoder();
            let buffer = '';
            let completed = false;
            
            while (!completed) {
              const { done, value } = await eventReader.read();
              
              if (done) {
                break;
              }
              
              buffer += decoder.decode(value, { stream: true });
              
              // Process complete SSE events
              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // Keep incomplete line in buffer
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  try {
                    const event = JSON.parse(data);
                    
                    // Handle text parts from message events
                    if (event.type === 'message.part.updated' || event.type === 'part.updated') {
                      const properties = event.properties;
                      // Check if this event is for our session (use correct casing: sessionId)
                      if (properties?.sessionId === sessionId || properties?.session?.id === sessionId) {
                        const part = properties.part || properties;
                        if (part?.type === 'text' && typeof part.text === 'string') {
                          const sseData = JSON.stringify({
                            type: 'text-delta',
                            textDelta: part.text,
                          });
                          controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
                        }
                      }
                    }
                    
                    // Check for session completion
                    if (event.type === 'session.updated' || event.type === 'session.completed') {
                      const properties = event.properties;
                      const eventSession = properties?.session || properties;
                      if (eventSession?.id === sessionId && !eventSession?.active) {
                        completed = true;
                        break;
                      }
                    }
                  } catch {
                    // Skip malformed JSON
                  }
                }
              }
            }
            
            // Ensure prompt completed and check for errors
            const promptResponse = await promptPromise;
            if (!promptResponse.ok) {
              const errorText = await promptResponse.text();
              Sentry.logger.error(
                Sentry.logger.fmt`OpenCode prompt request failed ${{
                  status: promptResponse.status,
                  error: errorText,
                }}`
              );
            }
            
          } finally {
            // Clean up resources
            if (eventReader) {
              try {
                await eventReader.cancel();
              } catch {
                // Ignore cancel errors
              }
            }
            
            // Clean up session
            if (sessionId) {
              try {
                await fetch(`${baseUrl}/session/${sessionId}`, {
                  method: 'DELETE',
                  headers,
                });
              } catch {
                // Ignore cleanup errors
              }
            }
          }
          
        } else {
          // Use legacy Claude SDK
          for await (const message of query({ prompt: fullPrompt, options: sdkOptions })) {
            if (message.type === 'assistant') {
              for (const block of message.message.content) {
                if (block.type === 'text') {
                  // Format as SSE data event
                  const data = JSON.stringify({
                    type: 'text-delta',
                    textDelta: block.text,
                  });
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                }
              }
            }
          }
        }

        // Send done event
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();

        Sentry.logger.info(Sentry.logger.fmt`Chat stream completed`);
      } catch (error) {
        Sentry.logger.error(
          Sentry.logger.fmt`Chat stream error ${{
            error: error instanceof Error ? error.message : String(error),
          }}`
        );
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
