import type { BuildOperationType } from '@/types/build';
import type { Project } from '@/contexts/ProjectContext';

/**
 * Detect the appropriate build operation type based on context
 */
export function detectOperationType(params: {
  project: Project;
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

  // Check if project has been built before
  const hasFiles = project.status === 'completed' || project.status === 'in_progress';
  const hasRunCommand = !!project.runCommand;

  // If project already exists and has been built, this is an enhancement
  if (hasFiles && hasRunCommand) {
    return 'enhancement';
  }

  // Otherwise, initial build
  return 'initial-build';
}

/**
 * Detect operation type from project status
 */
export function isNewProject(project: Project): boolean {
  return project.status === 'pending' || (!project.runCommand && !project.projectType);
}

/**
 * Create a fresh generation state for a new build
 */
export function createFreshGenerationState(params: {
  projectId: string;
  projectName: string;
  operationType: BuildOperationType;
}) {
  const buildId = `build-${Date.now()}`;

  return {
    id: buildId,
    projectId: params.projectId,
    projectName: params.projectName,
    operationType: params.operationType,
    todos: [],
    toolsByTodo: {},
    textByTodo: {},
    activeTodoIndex: -1,
    isActive: true,
    startTime: new Date(),
  };
}

/**
 * Validate generation state before using it
 */
export function validateGenerationState(state: any): boolean {
  if (!state) return false;
  if (!state.id || !state.projectId) return false;
  if (!Array.isArray(state.todos)) return false;
  return true;
}
