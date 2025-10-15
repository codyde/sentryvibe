"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectOperationType = detectOperationType;
exports.isNewProject = isNewProject;
exports.createFreshGenerationState = createFreshGenerationState;
exports.validateGenerationState = validateGenerationState;
exports.createInitialCodexSessionState = createInitialCodexSessionState;
/**
 * Detect the appropriate build operation type based on context
 */
function detectOperationType(params) {
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
function isNewProject(project) {
    return project.status === 'pending' || (!project.runCommand && !project.projectType);
}
/**
 * Create a fresh generation state for a new build
 */
function createFreshGenerationState(params) {
    const buildId = `build-${Date.now()}`;
    const baseState = {
        id: buildId,
        projectId: params.projectId,
        projectName: params.projectName,
        operationType: params.operationType,
        agentId: params.agentId,
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
function validateGenerationState(state) {
    if (!state)
        return false;
    if (!state.id || !state.projectId)
        return false;
    if (!Array.isArray(state.todos))
        return false;
    return true;
}
function createInitialCodexSessionState() {
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
