/**
 * Transform Claude Agent SDK messages into the SSE format expected by the frontend
 * Includes message lifecycle tracking and path violation detection
 */

// Use namespace import for buildLogger to work around CommonJS/ESM interop
import * as AgentCore from '@sentryvibe/agent-core';
const { buildLogger } = AgentCore;

interface SSEEvent {
  type: string;
  [key: string]: any;
}

interface TransformerState {
  currentMessageId: string | null;
  messageStarted: boolean;
  expectedCwd?: string;
  commandMetadata: Map<string, { command?: string }>;
}

// Track state across transformations
let transformerState: TransformerState = {
  currentMessageId: null,
  messageStarted: false,
  commandMetadata: new Map(),
};

export function resetTransformerState() {
  transformerState = {
    currentMessageId: null,
    messageStarted: false,
    commandMetadata: new Map(),
  };
}

export function setExpectedCwd(cwd: string) {
  transformerState.expectedCwd = cwd;
}

/**
 * Path violation detection - warns about absolute paths
 */
function detectPathViolations(toolName: string, input: any, expectedCwd?: string) {
  if (!['Bash', 'Read', 'Write', 'Edit'].includes(toolName)) {
    return;
  }

  const pathToCheck = input?.command || input?.file_path || input?.path || '';

  if (typeof pathToCheck === 'string') {
    // Only warn if absolute path is OUTSIDE the workspace entirely
    if (expectedCwd && pathToCheck.startsWith('/')) {
      // Get workspace root (parent of project directory)
      const workspaceRoot = expectedCwd.split('/').slice(0, -1).join('/');

      // Allow paths within workspace (project or parent workspace directory)
      const isWithinWorkspace = pathToCheck.startsWith(expectedCwd) || pathToCheck.startsWith(workspaceRoot);

      if (!isWithinWorkspace) {
        buildLogger.transformer.pathViolationWarning(toolName, pathToCheck, workspaceRoot);
      }
    }

    // Always warn about Desktop paths (hallucination indicator)
    if (pathToCheck.includes('/Desktop/')) {
      buildLogger.transformer.desktopPathDetected(pathToCheck);
    }
  }
}

export function transformAgentMessageToSSE(agentMessage: any): SSEEvent[] {
  const events: SSEEvent[] = [];

  if (agentMessage.type === 'assistant' && agentMessage.message) {
    const message = agentMessage.message;
    const assistantMessageId = message.id || `msg-${Date.now()}`;

    // Start new message if this is a different message ID
    if (assistantMessageId !== transformerState.currentMessageId) {
      // Finish previous message if one was open
      if (transformerState.messageStarted && transformerState.currentMessageId) {
        events.push({
          type: 'finish',
        });
      }

      // Start new message
      transformerState.currentMessageId = assistantMessageId;
      transformerState.messageStarted = true;
      events.push({
        type: 'start',
        messageId: assistantMessageId,
      });
    }

    // Process each content block
    if (message.content && Array.isArray(message.content)) {
      const processTodoWriteMarkers = (text: string) => {
        const regex = /TODO_WRITE\s*:\s*(\{[\s\S]*?\})(?=$|\n)/g;
        let match: RegExpExecArray | null;
        let cleaned = '';
        let lastIndex = 0;

        while ((match = regex.exec(text)) !== null) {
          const fullMatch = match[0];
          const jsonText = match[1];

          try {
            const payload = JSON.parse(jsonText);
            const toolCallId =
              typeof payload.toolCallId === 'string' && payload.toolCallId.length > 0
                ? payload.toolCallId
                : `codex-todo-${Date.now()}-${Math.random().toString(16).slice(2)}`;

            events.push({
              type: 'tool-input-available',
              toolCallId,
              toolName: 'TodoWrite',
              input: payload,
            });
          } catch (error) {
            if (process.env.DEBUG_BUILD === '1') console.warn('⚠️  Failed to parse TODO_WRITE payload:', error);
          }

          cleaned += text.slice(lastIndex, match.index);
          lastIndex = match.index + fullMatch.length;
        }

        cleaned += text.slice(lastIndex);
        return cleaned;
      };

      for (const block of message.content) {
        if (block.type === 'text' && block.text) {
          let text = String(block.text);

          // CRITICAL: Remove ALL task status formats from text BEFORE processing
          // We handle task status via synthetic TodoWrite events in the runner
          // Any task status in the text should be ignored to prevent conflicts

          text = processTodoWriteMarkers(text);

          // Remove old XML format completely
          text = text.replace(/<start-todolist>[\s\S]*?<\/start-todolist>/g, '').trim();
          text = text.replace(/<end-todolist>/g, '').trim();

          // Remove new structured format completely
          text = text.replace(/---TASK_STATUS---[\s\S]*?---END_TASK_STATUS---/g, '').trim();

          // DO NOT PARSE TASK STATUS FROM TEXT
          // The runner sends synthetic TodoWrite events with the authoritative state
          // Parsing from text causes stale/incorrect data

          const trimmed = text.trim();
          if (trimmed.length === 0) {
            continue;
          }

          const textBlockId = `${assistantMessageId}-text-${Date.now()}-${Math.random()}`;

          // Send all text as regular text-delta events for the chat
          // The UI will handle displaying it appropriately
          events.push({
            type: 'text-start',
            id: textBlockId,
          });

          events.push({
            type: 'text-delta',
            id: textBlockId,
            delta: text,
          });

          events.push({
            type: 'text-end',
            id: textBlockId,
          });
        } else if (block.type === 'tool_use') {
          // Detect path violations
          detectPathViolations(block.name, block.input, transformerState.expectedCwd);

          // Send tool input with available state
          events.push({
            type: 'tool-input-available',
            toolCallId: block.id,
            toolName: block.name,
            input: block.input,
          });

          if (block.name === 'command_execution') {
          const command =
            typeof block.input?.command === 'string'
              ? block.input.command
              : '';
          transformerState.commandMetadata.set(block.id, { command });

            events.push({
              type: 'command_start',
              command,
              id: block.id,
            });
          }
        }
      }
    }
  } else if (agentMessage.type === 'user' && agentMessage.message) {
    // Process tool results
    const message = agentMessage.message;
    if (message.content && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.type === 'tool_result') {
          const toolId = block.tool_use_id;
          let output = block.content;
          if (Array.isArray(output)) {
            output = output
              .map((c: any) => (typeof c?.text === 'string' ? c.text : JSON.stringify(c)))
              .join('\n');
          } else if (typeof output !== 'string') {
            output = JSON.stringify(output);
          }

          // Process TodoWrite markers in command outputs
          if (typeof output === 'string' && output.includes('TODO_WRITE')) {
            const regex = /TODO_WRITE\s*:\s*(\{[\s\S]*?\})(?=$|\n)/g;
            let match: RegExpExecArray | null;
            while ((match = regex.exec(output)) !== null) {
              try {
                const payload = JSON.parse(match[1]);
                events.push({
                  type: 'tool-input-available',
                  toolCallId: payload.toolCallId ?? toolId ?? `todo-${Date.now()}`,
                  toolName: 'TodoWrite',
                  input: payload,
                });
              } catch (error) {
                if (process.env.DEBUG_BUILD === '1') console.warn('⚠️  Failed to parse TODO_WRITE payload from tool result:', error);
              }
            }
          }

          events.push({
            type: 'tool-output-available',
            toolCallId: block.tool_use_id,
            output: block.content,
          });

          const commandMeta = transformerState.commandMetadata.get(toolId);
          if (commandMeta) {
            events.push({
              type: 'command_complete',
              id: toolId,
              command: commandMeta.command,
              output,
              exitCode: block.exit_code,
              status: block.status ?? (block.is_error ? 'failed' : 'completed'),
            });
            transformerState.commandMetadata.delete(toolId);
          }
        }
      }
    }
  } else if (agentMessage.type === 'result') {
    // Finish the current message if still open
    if (transformerState.messageStarted && transformerState.currentMessageId) {
      events.push({
        type: 'finish',
      });
      transformerState.messageStarted = false;
      transformerState.currentMessageId = null;
    }

    // Final result message
    events.push({
      type: 'result',
      result: agentMessage.result,
    });
  }

  return events;
}
