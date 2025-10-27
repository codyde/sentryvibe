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

export async function POST(req: Request) {
  const {
    messages,
    claudeModel,
  }: { messages: UIMessage[]; claudeModel?: ClaudeModelId } = await req.json();
  
  Sentry.logger.info(
    Sentry.logger.fmt`Processing chat messages ${{
      messageCount: messages.length,
      messages,
      claudeModel,
    }}`
  );

  const selectedClaudeModel: ClaudeModelId =
    claudeModel === "claude-haiku-4-5" || claudeModel === "claude-sonnet-4-5"
      ? claudeModel
      : DEFAULT_CLAUDE_MODEL_ID;

  const result = streamText({
    model: claudeCode(selectedClaudeModel),
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
