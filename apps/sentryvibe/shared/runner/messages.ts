export type RunnerCommandType =
  | 'start-build'
  | 'start-dev-server'
  | 'stop-dev-server'
  | 'fetch-logs'
  | 'runner-health-check';

export type RunnerEventType =
  | 'ack'
  | 'log-chunk'
  | 'port-detected'
  | 'process-exited'
  | 'build-progress'
  | 'build-completed'
  | 'build-failed'
  | 'runner-status'
  | 'build-stream'
  | 'project-metadata'
  | 'error';

export interface BaseCommand {
  id: string;
  type: RunnerCommandType;
  projectId: string;
  timestamp: string;
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

export type RunnerCommand =
  | StartBuildCommand
  | StartDevServerCommand
  | StopDevServerCommand
  | FetchLogsCommand
  | RunnerHealthCheckCommand;

export interface BaseEvent {
  type: RunnerEventType;
  commandId?: string;
  projectId?: string;
  timestamp: string;
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

export interface ProcessExitedEvent extends BaseEvent {
  type: 'process-exited';
  exitCode: number | null;
  signal: string | null;
  durationMs: number | null;
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
  };
}

export interface BuildFailedEvent extends BaseEvent {
  type: 'build-failed';
  error: string;
  stack?: string;
}

export interface BuildStreamEvent extends BaseEvent {
  type: 'build-stream';
  data: string;
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

export interface ErrorEvent extends BaseEvent {
  type: 'error';
  error: string;
  stack?: string;
}

export interface ProjectMetadataEvent extends BaseEvent {
  type: 'project-metadata';
  payload: {
    path: string;
    projectType: string;
    runCommand: string;
    port: number;
  };
}

export type RunnerEvent =
  | AckEvent
  | LogChunkEvent
  | PortDetectedEvent
  | ProcessExitedEvent
  | BuildProgressEvent
  | BuildCompletedEvent
  | BuildFailedEvent
  | RunnerStatusEvent
  | BuildStreamEvent
  | ProjectMetadataEvent
  | ErrorEvent;

export type RunnerMessage = RunnerCommand | RunnerEvent;

const COMMAND_TYPES: RunnerCommandType[] = [
  'start-build',
  'start-dev-server',
  'stop-dev-server',
  'fetch-logs',
  'runner-health-check',
];

export const isRunnerCommand = (message: RunnerMessage): message is RunnerCommand =>
  COMMAND_TYPES.includes((message as RunnerMessage).type as RunnerCommandType);

export const isRunnerEvent = (message: RunnerMessage): message is RunnerEvent =>
  !isRunnerCommand(message);
