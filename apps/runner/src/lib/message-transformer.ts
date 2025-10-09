/**
 * Transform Claude Agent SDK messages into the SSE format expected by the frontend
 * Includes message lifecycle tracking and path violation detection
 */

interface SSEEvent {
  type: string;
  [key: string]: any;
}

interface TransformerState {
  currentMessageId: string | null;
  messageStarted: boolean;
  expectedCwd?: string;
}

// Track state across transformations
let transformerState: TransformerState = {
  currentMessageId: null,
  messageStarted: false,
};

export function resetTransformerState() {
  transformerState = {
    currentMessageId: null,
    messageStarted: false,
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
        console.warn('⚠️  Path outside workspace:');
        console.warn(`   Tool: ${toolName}`);
        console.warn(`   Path: ${pathToCheck}`);
        console.warn(`   Workspace: ${workspaceRoot}`);
      }
    }

    // Always warn about Desktop paths (hallucination indicator)
    if (pathToCheck.includes('/Desktop/')) {
      console.error('🚨 DESKTOP PATH DETECTED - Likely hallucinated:', pathToCheck);
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
      for (const block of message.content) {
        if (block.type === 'text' && block.text) {
          const textBlockId = `${assistantMessageId}-text-${Date.now()}-${Math.random()}`;

          events.push({
            type: 'text-start',
            id: textBlockId,
          });

          events.push({
            type: 'text-delta',
            id: textBlockId,
            delta: block.text,
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
        }
      }
    }
  } else if (agentMessage.type === 'user' && agentMessage.message) {
    // Process tool results
    const message = agentMessage.message;
    if (message.content && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.type === 'tool_result') {
          events.push({
            type: 'tool-output-available',
            toolCallId: block.tool_use_id,
            output: block.content,
          });
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

