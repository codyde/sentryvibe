import type { AgentId as CoreAgentId, ClaudeModelId as CoreClaudeModelId } from '../../types/agent';
import type { DesignPreferences } from '../../types/design';
import type { AppliedTag } from '../../types/tags';

export type AgentId = CoreAgentId;
export type ClaudeModelId = CoreClaudeModelId;

export type RunnerCommandType =
  | 'start-build'
  | 'start-dev-server'
  | 'stop-dev-server'
  | 'start-tunnel'
  | 'stop-tunnel'
  | 'fetch-logs'
  | 'runner-health-check'
  | 'delete-project-files'
  | 'read-file'
  | 'write-file'
  | 'list-files';

export type RunnerEventType =
  | 'ack'
  | 'log-chunk'
  | 'port-detected'
  | 'port-conflict'
  | 'tunnel-created'
  | 'tunnel-closed'
  | 'process-exited'
  | 'build-progress'
  | 'build-completed'
  | 'build-failed'
  | 'runner-status'
  | 'build-stream'
  | 'project-metadata'
  | 'files-deleted'
  | 'file-content'
  | 'file-written'
  | 'file-list'
  | 'dev-server-error'
  | 'autofix-started'
  | 'error';

export interface BaseCommand {
  id: string;
  type: RunnerCommandType;
  projectId: string;
  timestamp: string;
  _sentry?: {
    trace?: string;
    baggage?: string;
  };
}

export interface StartBuildCommand extends BaseCommand {
  type: 'start-build';
  payload: {
    prompt: string;
    operationType: string;
    projectSlug: string;
    projectName: string;
    context?: Record<string, unknown>;
    templateId?: string | null;
    regenerate?: boolean;
    agent?: AgentId;
    claudeModel?: ClaudeModelId;
    codexThreadId?: string; // For resuming Codex threads
    template?: {
      id: string;
      name: string;
      framework: string;
      port: number;
      runCommand: string;
      repository: string;
      branch: string;
    }; // NEW: Frontend-selected template metadata
    designPreferences?: DesignPreferences; // User-specified design constraints (deprecated - use tags)
    tags?: AppliedTag[]; // Tag-based configuration system
    conversationHistory?: Array<{
      role: string;
      content: string;
      timestamp: Date;
    }>; // Recent conversation messages for context in enhancements
    isAutoFix?: boolean; // Flag for auto-fix sessions triggered by startup/runtime errors
    autoFixError?: string; // The error message that triggered the auto-fix
  };
}

export interface StartDevServerCommand extends BaseCommand {
  type: 'start-dev-server';
  payload: {
    runCommand: string;
    workingDirectory: string;
    env?: Record<string, string>;
    preferredPort?: number | null;
    framework?: string;
  };
}

export interface StopDevServerCommand extends BaseCommand {
  type: 'stop-dev-server';
}

export interface StartTunnelCommand extends BaseCommand {
  type: 'start-tunnel';
  payload: {
    port: number;
  };
}

export interface StopTunnelCommand extends BaseCommand {
  type: 'stop-tunnel';
  payload: {
    port: number;
  };
}

export interface FetchLogsCommand extends BaseCommand {
  type: 'fetch-logs';
  payload: {
    cursor?: string;
    limit?: number;
  };
}

export interface RunnerHealthCheckCommand extends BaseCommand {
  type: 'runner-health-check';
}

export interface DeleteProjectFilesCommand extends BaseCommand {
  type: 'delete-project-files';
  payload: {
    slug: string;
  };
}

export interface ReadFileCommand extends BaseCommand {
  type: 'read-file';
  payload: {
    slug: string;
    filePath: string;
  };
}

export interface WriteFileCommand extends BaseCommand {
  type: 'write-file';
  payload: {
    slug: string;
    filePath: string;
    content: string;
  };
}

export interface ListFilesCommand extends BaseCommand {
  type: 'list-files';
  payload: {
    slug: string;
    path?: string;
  };
}

export type RunnerCommand =
  | StartBuildCommand
  | StartDevServerCommand
  | StopDevServerCommand
  | StartTunnelCommand
  | StopTunnelCommand
  | FetchLogsCommand
  | RunnerHealthCheckCommand
  | DeleteProjectFilesCommand
  | ReadFileCommand
  | WriteFileCommand
  | ListFilesCommand;

export interface BaseEvent {
  type: RunnerEventType;
  commandId?: string;
  projectId?: string;
  timestamp: string;
  _sentry?: {
    trace?: string;
    baggage?: string;
  };
}

export interface AckEvent extends BaseEvent {
  type: 'ack';
  message?: string;
}

export interface LogChunkEvent extends BaseEvent {
  type: 'log-chunk';
  stream: 'stdout' | 'stderr';
  data: string;
  cursor: string;
}

export interface PortDetectedEvent extends BaseEvent {
  type: 'port-detected';
  port: number;
  tunnelUrl?: string;
  framework: string;
}

export interface TunnelCreatedEvent extends BaseEvent {
  type: 'tunnel-created';
  port: number;
  tunnelUrl: string;
}

export interface PortConflictEvent extends BaseEvent {
  type: 'port-conflict';
  port: number;
  message?: string;
}

export interface TunnelClosedEvent extends BaseEvent {
  type: 'tunnel-closed';
  port: number;
}

export interface ProcessExitedEvent extends BaseEvent {
  type: 'process-exited';
  exitCode: number | null;
  signal: string | null;
  durationMs: number | null;
  state?: string;
  failureReason?: string;
  stderr?: string; // Captured stderr output for immediate crashes
}

export interface BuildProgressEvent extends BaseEvent {
  type: 'build-progress';
  payload: {
    stage: 'planning' | 'generating' | 'applying' | 'finalizing';
    message: string;
    todoId?: string;
    todoStatus?: 'pending' | 'in_progress' | 'completed' | 'failed';
  };
}

export interface BuildCompletedEvent extends BaseEvent {
  type: 'build-completed';
  payload: {
    todos: Array<{
      id: string;
      title: string;
      status: 'completed' | 'skipped';
    }>;
    summary?: string;
    detectedFramework?: string | null; // Framework detected from project files
  };
}

export interface BuildFailedEvent extends BaseEvent {
  type: 'build-failed';
  error: string;
  stack?: string;
}

export interface RunnerStatusEvent extends BaseEvent {
  type: 'runner-status';
  payload: {
    status: 'online' | 'offline' | 'degraded';
    version: string;
    hostname: string;
    platform: string;
    uptimeSeconds: number;
    load?: number;
  };
}

export interface BuildStreamEvent extends BaseEvent {
  type: 'build-stream';
  data: string;
}

export interface ProjectMetadataEvent extends BaseEvent {
  type: 'project-metadata';
  payload: {
    path: string;
    projectType: string;
    runCommand: string;
    port: number;
    detectedFramework?: string;
  };
}

export interface FilesDeletedEvent extends BaseEvent {
  type: 'files-deleted';
  slug: string;
}

export interface FileContentEvent extends BaseEvent {
  type: 'file-content';
  slug: string;
  filePath: string;
  content: string;
  size: number;
}

export interface FileWrittenEvent extends BaseEvent {
  type: 'file-written';
  slug: string;
  filePath: string;
}

export interface FileListEvent extends BaseEvent {
  type: 'file-list';
  slug: string;
  files: Array<{
    name: string;
    type: 'file' | 'directory';
    path: string;
    size?: number;
  }>;
}

export interface ErrorEvent extends BaseEvent {
  type: 'error';
  error: string;
  stack?: string;
}

export interface DevServerErrorEvent extends BaseEvent {
  type: 'dev-server-error';
  error: string;
  message: string;
}

export interface AutoFixStartedEvent extends BaseEvent {
  type: 'autofix-started';
  errorType: 'startup' | 'runtime'; // Whether this is a startup crash or runtime error
  errorMessage: string;
  attempt: number;
  maxAttempts: number;
}

export type RunnerEvent =
  | AckEvent
  | LogChunkEvent
  | PortDetectedEvent
  | PortConflictEvent
  | TunnelCreatedEvent
  | TunnelClosedEvent
  | ProcessExitedEvent
  | BuildProgressEvent
  | BuildCompletedEvent
  | BuildFailedEvent
  | RunnerStatusEvent
  | BuildStreamEvent
  | ProjectMetadataEvent
  | FilesDeletedEvent
  | FileContentEvent
  | FileWrittenEvent
  | FileListEvent
  | DevServerErrorEvent
  | AutoFixStartedEvent
  | ErrorEvent;

export type RunnerMessage = RunnerCommand | RunnerEvent;

const COMMAND_TYPES: RunnerCommandType[] = [
  'start-build',
  'start-dev-server',
  'stop-dev-server',
  'start-tunnel',
  'stop-tunnel',
  'fetch-logs',
  'runner-health-check',
  'delete-project-files',
  'read-file',
  'write-file',
  'list-files',
];

export const isRunnerCommand = (message: RunnerMessage): message is RunnerCommand =>
  COMMAND_TYPES.includes((message as RunnerMessage).type as RunnerCommandType);

export const isRunnerEvent = (message: RunnerMessage): message is RunnerEvent =>
  !isRunnerCommand(message);
