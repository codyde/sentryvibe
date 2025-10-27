import { streamText, UIMessage, convertToModelMessages } from "ai";
import { createClaudeCode } from "ai-sdk-provider-claude-code";
import { DEFAULT_CLAUDE_MODEL_ID } from "@sentryvibe/agent-core/types/agent";
import type { ClaudeModelId } from "@sentryvibe/agent-core/types/agent";
import * as Sentry from "@sentry/nextjs";

const claudeCode = createClaudeCode({
  defaultSettings: {
    permissionMode: "bypassPermissions",
    customSystemPrompt: `You are a helpful coding assistant specialized in building JavaScript applications and prototyping ideas.

CRITICAL WORKFLOW - FOLLOW THIS EXACT SEQUENCE:

Projects should ALWAYS be created in the <current-project-root>/projects/ directory. Do NOT EVER create projects outside of this directory under any circumstances.When creating a new JavaScript project, you MUST:

1. ALWAYS use CLI tools to scaffold projects - NEVER manually create project files:
   - For Next.js: npx create-next-app@latest <project-name>
   - For Vite + React: npm create vite@latest <project-name> -- --template react-ts
   - For other frameworks: use their official CLI scaffolding tools

2. After completion, you MUST test the build:
   - Start the development server (npm run dev, npm start, etc.)
   - Wait for it to start successfully and verify no errors
   - Check the terminal output carefully
   - If there are any errors, fix them
   - After testing is complete, stop the dev server (Ctrl+C)
   - Do NOT leave the dev server running 

3. After completing ALL tasks, ALWAYS offer to install Sentry:
   - Ask if the user wants Sentry installed
   - If yes, consult Sentry documentation for the correct installation method
   - Follow Sentry's official setup guide for the specific framework

NEVER manually create project files when a CLI tool exists.
ALWAYS verify each step is complete before moving to the next.`,
  },
});

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
    projectContext,
  }: { 
    messages: UIMessage[]; 
    claudeModel?: ClaudeModelId;
    projectContext?: ProjectContext;
  } = await req.json();
  
  Sentry.logger.info(
    Sentry.logger.fmt`Processing chat messages ${{
      messageCount: messages.length,
      messages,
      claudeModel,
      hasProjectContext: !!projectContext,
      projectContext,
    }}`
  );

  const selectedClaudeModel: ClaudeModelId =
    claudeModel === "claude-haiku-4-5" || claudeModel === "claude-sonnet-4-5"
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
- You have access to the project's file system through tools
- Use tools to read files, understand the codebase, and make targeted changes
- DO NOT create new projects or trigger full scaffolding
- DO NOT use CLI scaffolding tools like "create-next-app" or "create vite"
- Focus on understanding the current state and making precise, helpful changes
- If the user wants major architectural changes, suggest they use the "Build" tab instead
- Keep responses focused and conversational - this is a chat, not a full build process

You can:
✅ Read files to understand the project
✅ Make small edits and fixes
✅ Answer questions about the code
✅ Explain how things work
✅ Add new features to existing files
✅ Debug issues

You should NOT:
❌ Create entirely new projects
❌ Run CLI scaffolding commands
❌ Make massive architectural changes
❌ Delete or restructure the entire project

Remember: This is an iterative chat about an existing project, not a full build session.`;
  } else {
    // No project context - this shouldn't normally happen but provide a basic prompt
    systemPrompt = `You are a helpful coding assistant. You can answer questions and help with code, but for creating new projects, the user should use the main interface.`;
  }

  const result = streamText({
    model: claudeCode(selectedClaudeModel),
    system: systemPrompt,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "Code",
    },
    messages: convertToModelMessages(messages),
    async onStepFinish({
      text,
      toolCalls,
      toolResults,
      finishReason,
      usage,
      response,
    }) {
      Sentry.logger.info(
        Sentry.logger.fmt`Chat step finished ${{
          finishReason,
          usage,
          hasText: !!text,
          toolCallsCount: toolCalls?.length || 0,
          toolResultsCount: toolResults?.length || 0,
          responseType: response ? "has response" : "no response",
        }}`
      );

      // Log tool activity
      if (toolCalls && toolCalls.length > 0) {
        Sentry.logger.info(
          Sentry.logger.fmt`Tool calls executed ${{
            toolCalls,
          }}`
        );
      }
      if (toolResults && toolResults.length > 0) {
        Sentry.logger.info(
          Sentry.logger.fmt`Tool results received ${{
            toolResults,
          }}`
        );
      }
      if (text) {
        Sentry.logger.info(
          Sentry.logger.fmt`Text generated ${{
            text,
            textPreview: text.slice(0, 200),
          }}`
        );
      }

      // Log the full response
      if (response?.messages) {
        Sentry.logger.info(
          Sentry.logger.fmt`Response messages ${{
            messages: response.messages,
          }}`
        );
      }
    },
  });

  Sentry.logger.info(Sentry.logger.fmt`Streaming chat response back to client`);
  return result.toUIMessageStreamResponse();
}
