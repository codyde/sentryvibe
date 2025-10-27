import type { BuildOperationType } from '@/types/build';
import type { AgentId } from '@/types/agent';
import type { ClaudeModelId } from '../shared/runner/messages';
import type { CodexSessionState, GenerationState } from '@/types/generation';
import type { ProjectSummary } from '@/types/project';

/**
 * Detect the appropriate build operation type based on context
 */
export function detectOperationType(params: {
  project: ProjectSummary;
  isElementChange?: boolean;
  isRetry?: boolean;
}): BuildOperationType {
  const { project, isElementChange, isRetry } = params;

  // Retry a failed build
  if (isRetry) {
    return 'continuation';
  }

  // Element selector triggered change
  if (isElementChange) {
    return 'focused-edit';
  }

  // CRITICAL: If project status is 'completed' or 'in_progress', it's an existing project
  // Even if runCommand is missing, we should NEVER overwrite a completed project
  // Missing runCommand is a metadata issue, not a reason to destroy the project
  if (project.status === 'completed' || project.status === 'in_progress') {
    return 'enhancement';
  }

  // Only treat as initial-build if status is 'pending' or 'failed'
  // This prevents accidentally overwriting existing projects
  return 'initial-build';
}

/**
 * Detect operation type from project status
 */
export function isNewProject(project: ProjectSummary): boolean {
  return project.status === 'pending' || (!project.runCommand && !project.projectType);
}

/**
 * Create a fresh generation state for a new build
 */
export function createFreshGenerationState(params: {
  projectId: string;
  projectName: string;
  operationType: BuildOperationType;
  agentId?: AgentId;
  claudeModelId?: ClaudeModelId;
}): GenerationState {
  const buildId = `build-${Date.now()}`;

  const baseState: GenerationState = {
    id: buildId,
    projectId: params.projectId,
    projectName: params.projectName,
    operationType: params.operationType,
    agentId: params.agentId,
    claudeModelId: params.claudeModelId,
    todos: [],
    toolsByTodo: {},
    textByTodo: {},
    activeTodoIndex: -1,
    isActive: true,
    startTime: new Date(),
  };

  if (params.agentId === 'openai-codex') {
    baseState.codex = createInitialCodexSessionState();
  }

  return baseState;
}

/**
 * Validate generation state before using it
 */
export function validateGenerationState(state: unknown): boolean {
  if (!state) return false;
  if (!(state as GenerationState).id || !(state as GenerationState).projectId) return false;
  if (!Array.isArray((state as GenerationState).todos)) return false;
  return true;
}

export function createInitialCodexSessionState(): CodexSessionState {
  const now = new Date();
  return {
    phases: [
      {
        id: 'prompt-analysis',
        title: 'Analyze Prompt',
        description: 'Reviewing your request and extracting build requirements.',
        status: 'active',
        startedAt: now,
      },
      {
        id: 'template-selection',
        title: 'Select Template',
        description: 'Choosing the best starter template to clone.',
        status: 'pending',
      },
      {
        id: 'template-clone',
        title: 'Clone Template',
        description: 'Cloning the project template with degit.',
        status: 'pending',
      },
      {
        id: 'workspace-verification',
        title: 'Verify Workspace',
        description: 'Ensuring the cloned project exists in the workspace.',
        status: 'pending',
      },
      {
        id: 'task-synthesis',
        title: 'Summarize Tasks',
        description: 'Translating the prompt into concrete tasks.',
        status: 'pending',
      },
      {
        id: 'execution',
        title: 'Execute Build',
        description: 'Implementing features and producing code updates.',
        status: 'pending',
      },
    ],
    lastUpdatedAt: now,
  };
}
