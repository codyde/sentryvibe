/**
 * Unified Build Logger
 * Provides structured, consistent logging across all build components
 * with correlation tracking and context-specific methods
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogContext = 'runner' | 'orchestrator' | 'transformer' | 'codex-query' | 'claude-query' | 'build';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: LogContext;
  buildId?: string;
  projectId?: string;
  message: string;
  data?: Record<string, unknown>;
}

class BuildLogger {
  private buildId: string | null = null;
  private projectId: string | null = null;

  /**
   * Set correlation IDs for the current build
   * Call this at the start of each build to enable correlation tracking
   */
  setBuildContext(buildId: string, projectId: string) {
    this.buildId = buildId;
    this.projectId = projectId;
    this.log('debug', 'runner', `Build context set: ${buildId} / ${projectId}`);
  }

  /**
   * Clear correlation IDs after build completes
   */
  clearBuildContext() {
    this.log('debug', 'runner', 'Build context cleared');
    this.buildId = null;
    this.projectId = null;
  }

  /**
   * Core logging method - creates structured log entries
   * Public for custom logging needs
   */
  log(level: LogLevel, context: LogContext, message: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      buildId: this.buildId ?? undefined,
      projectId: this.projectId ?? undefined,
      message,
      data,
    };

    // Console output with color coding and icons
    const prefix = `[${context}]`;
    const icon = {
      debug: '🔍',
      info: '📋',
      warn: '⚠️ ',
      error: '❌',
    }[level];

    const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;

    if (data && Object.keys(data).length > 0) {
      logFn(`${icon} ${prefix} ${message}`, data);
    } else {
      logFn(`${icon} ${prefix} ${message}`);
    }

    // Future: Could integrate with Sentry breadcrumbs or structured logging service
  }

  /**
   * Orchestrator-specific logging methods
   */
  orchestrator = {
    newProject: (operationType: string) =>
      this.log('info', 'orchestrator', `NEW PROJECT (operationType: ${operationType})`),

    existingProject: (operationType: string) =>
      this.log('info', 'orchestrator', `EXISTING PROJECT (operationType: ${operationType})`),

    templateProvided: (templateName: string, templateId: string, framework: string) =>
      this.log('info', 'orchestrator', `Frontend provided template: ${templateName}`, {
        templateId,
        framework
      }),

    templateSelecting: (method: 'auto' | 'agent-managed') =>
      this.log('info', 'orchestrator', `Template selection: ${method}`),

    templateSelected: (templateName: string, templateId: string) =>
      this.log('info', 'orchestrator', `Selected template: ${templateName}`, { templateId }),

    templateDownloading: (templateName: string, repository: string, target: string) =>
      this.log('info', 'orchestrator', `Downloading template: ${templateName}`, {
        repository,
        target
      }),

    templateDownloaded: (templateName: string, path: string, fileTreeSize: number) =>
      this.log('info', 'orchestrator', `Template downloaded: ${templateName}`, {
        path,
        fileTreeSize
      }),

    catalogPrepared: (catalogSize: number) =>
      this.log('info', 'orchestrator', `Template catalog prepared (${catalogSize} chars)`, {
        catalogSize
      }),

    systemPromptGenerated: (size: number) =>
      this.log('info', 'orchestrator', `System prompt generated (${size} chars)`, { size }),

    orchestrationComplete: (data: { isNewProject: boolean; hasTemplate: boolean; hasMetadata: boolean }) =>
      this.log('info', 'orchestrator', 'Orchestration complete', data),

    error: (message: string, error: unknown) =>
      this.log('error', 'orchestrator', message, {
        error: error instanceof Error ? error.message : String(error)
      }),
  };

  /**
   * Message transformer-specific logging methods
   */
  transformer = {
    todoListFound: () =>
      this.log('debug', 'transformer', 'Found Codex task list, parsing...'),

    todoListParsed: (todoCount: number, completed: number, inProgress: number, pending: number) =>
      this.log('info', 'transformer', `Parsed ${todoCount} todos`, {
        completed,
        inProgress,
        pending
      }),

    todoListInvalidFormat: (expected: string, got: unknown) =>
      this.log('error', 'transformer', 'Invalid todo format from Codex', {
        expected,
        got: JSON.stringify(got).substring(0, 200)
      }),

    todoListParseError: (error: unknown, rawJson: string) =>
      this.log('error', 'transformer', 'Failed to parse Codex todolist', {
        error: String(error),
        rawJson: rawJson.substring(0, 300)
      }),

    todoListRemoved: () =>
      this.log('debug', 'transformer', 'Removed task list from chat text'),

    toolStarted: (toolName: string, toolId: string) =>
      this.log('debug', 'transformer', `Tool started: ${toolName}`, { toolName, toolId }),

    toolCompleted: (toolName: string, toolId: string) =>
      this.log('debug', 'transformer', `Tool completed: ${toolName}`, { toolName, toolId }),

    pathViolationWarning: (toolName: string, path: string, workspace: string) =>
      this.log('warn', 'transformer', `Path outside workspace: ${path}`, {
        toolName,
        path,
        workspace
      }),

    desktopPathDetected: (path: string) =>
      this.log('error', 'transformer', `DESKTOP PATH DETECTED - Likely hallucinated: ${path}`, { path }),
  };

  /**
   * Codex query-specific logging methods
   */
  codexQuery = {
    promptBuilding: (workingDirectory: string, systemPromptSize: number, userPromptSize: number) =>
      this.log('info', 'codex-query', 'Building Codex prompt', {
        workingDirectory,
        systemPromptSize,
        userPromptSize,
      }),

    threadStarting: () =>
      this.log('info', 'codex-query', 'Starting Codex thread (multi-turn)'),

    turnStarted: (turnNumber: number, maxTurns: number, promptSize: number) =>
      this.log('info', 'codex-query', `═══ Turn ${turnNumber}/${maxTurns} ═══`, {
        turnNumber,
        maxTurns,
        promptSize,
      }),

    taskListExtracted: () =>
      this.log('info', 'codex-query', 'Task list extracted and updated'),

    taskListStatus: (completed: number, inProgress: number, pending: number, total: number) =>
      this.log('info', 'codex-query', `Tasks: ${completed} completed | ${inProgress} in_progress | ${pending} pending (total: ${total})`, {
        completed,
        inProgress,
        pending,
        total,
      }),

    taskListTask: (index: number, content: string, status: string, icon: string) =>
      this.log('debug', 'codex-query', `  ${icon} ${index + 1}. ${content}`, { status }),

    taskListParseError: (error: unknown, rawContent: string) =>
      this.log('error', 'codex-query', 'PARSE ERROR: Could not parse task list JSON', {
        error: String(error),
        rawContent: rawContent.substring(0, 200),
      }),

    taskListMissing: (turnNumber: number) =>
      this.log('warn', 'codex-query', `WARNING: No <start-todolist> tags found in Turn ${turnNumber}`, {
        turnNumber,
      }),

    turnComplete: (turnNumber: number, hadToolCalls: boolean, messageLength: number) =>
      this.log('info', 'codex-query', `Turn ${turnNumber} complete`, {
        hadToolCalls,
        messageLength,
      }),

    allTasksComplete: () =>
      this.log('info', 'codex-query', '✅ All MVP tasks complete!'),

    taskCompleteDetected: () =>
      this.log('info', 'codex-query', '✅ Task complete (detected completion signal)'),

    continuePrompting: (reason: string) =>
      this.log('warn', 'codex-query', `No tools used but not done - ${reason}`),

    continuing: () =>
      this.log('info', 'codex-query', '⏭️  Continuing to next turn (had tool calls)'),

    loopExited: (turnCount: number, maxTurns: number) =>
      this.log('info', 'codex-query', `EXITED WHILE LOOP after ${turnCount} turns`, {
        turnCount,
        maxTurns,
      }),

    sessionComplete: (turnCount: number) =>
      this.log('info', 'codex-query', `Session complete after ${turnCount} turns`, { turnCount }),

    error: (message: string, error: unknown) =>
      this.log('error', 'codex-query', message, {
        error: error instanceof Error ? error.message : String(error)
      }),
  };

  /**
   * Claude query-specific logging methods
   */
  claudeQuery = {
    queryStarted: (model: string, cwd: string, maxTurns: number) =>
      this.log('info', 'claude-query', `Starting Claude query (${model})`, {
        cwd,
        maxTurns,
      }),

    error: (message: string, error: unknown) =>
      this.log('error', 'claude-query', message, {
        error: error instanceof Error ? error.message : String(error)
      }),
  };

  /**
   * Runner-specific logging methods
   */
  runner = {
    workspaceRoot: (path: string) =>
      this.log('info', 'runner', `Workspace root: ${path}`, { path }),

    commandReceived: (commandType: string, projectId: string) =>
      this.log('info', 'runner', `Received command: ${commandType}`, { commandType, projectId }),

    buildOperation: (operationType: string, projectSlug: string, agentId: string) =>
      this.log('info', 'runner', `Build operation: ${operationType}`, {
        operationType,
        projectSlug,
        agentId,
      }),

    templateProvided: (templateId: string) =>
      this.log('info', 'runner', `Template provided by frontend: ${templateId}`, { templateId }),

    buildStreamCreated: () =>
      this.log('info', 'runner', 'Build stream created, starting to process chunks...'),

    firstChunkReceived: (agentLabel: string) =>
      this.log('info', 'runner', `First chunk received from ${agentLabel}`, { agentLabel }),

    streamEnded: (chunkCount: number) =>
      this.log('info', 'runner', `Stream ended after ${chunkCount} chunks`, { chunkCount }),

    buildCompleted: (projectId: string) =>
      this.log('info', 'runner', `Build completed successfully`, { projectId }),

    buildFailed: (error: string) =>
      this.log('error', 'runner', `Build failed: ${error}`, { error }),

    portDetected: (port: number) =>
      this.log('info', 'runner', `Port detected: ${port}`, { port }),

    tunnelCreated: (port: number, tunnelUrl: string) =>
      this.log('info', 'runner', `Tunnel created: ${tunnelUrl} → localhost:${port}`, {
        port,
        tunnelUrl
      }),

    error: (message: string, error: unknown, context?: Record<string, unknown>) =>
      this.log('error', 'runner', message, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        ...context,
      }),
  };

  /**
   * Build stream-specific logging (tool calls, text, etc.)
   */
  build = {
    agentText: (agentLabel: string, text: string) => {
      const truncated = text.length > 200 ? text.slice(0, 200) + '...' : text;
      this.log('debug', 'build', `${agentLabel}: ${truncated}`, {
        agentLabel,
        textLength: text.length
      });
    },

    agentThinking: (thinking: string) => {
      const truncated = thinking.length > 300 ? thinking.slice(0, 300) + '...' : thinking;
      this.log('debug', 'build', `Thinking: ${truncated}`, {
        thinkingLength: thinking.length
      });
    },

    toolCalled: (toolName: string, toolId: string, inputSize: number) =>
      this.log('info', 'build', `Tool called: ${toolName} (${toolId})`, {
        toolName,
        toolId,
        inputSize
      }),

    toolResult: (toolId: string, outputSize: number, isError: boolean) =>
      this.log(isError ? 'error' : 'info', 'build', `Tool result (${toolId})`, {
        toolId,
        outputSize,
        isError
      }),

    runCommandDetected: (runCommand: string) =>
      this.log('info', 'build', `Detected runCommand: ${runCommand}`, { runCommand }),
  };
}

// Singleton instance
export const buildLogger = new BuildLogger();
