import type { AgentId } from './agent';
export interface TodoItem {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    activeForm: string;
}
export interface ToolCall {
    id: string;
    name: string;
    input?: unknown;
    output?: unknown;
    state: 'input-streaming' | 'input-available' | 'output-available';
    startTime: Date;
    endTime?: Date;
}
export interface TextMessage {
    id: string;
    text: string;
    timestamp: Date;
}
export type BuildOperationType = 'initial-build' | 'enhancement' | 'focused-edit' | 'continuation';
export type CodexPhaseId = 'prompt-analysis' | 'template-selection' | 'template-clone' | 'workspace-verification' | 'task-synthesis' | 'execution';
export type CodexPhaseStatus = 'pending' | 'active' | 'completed' | 'blocked';
export interface CodexPhase {
    id: CodexPhaseId;
    title: string;
    description: string;
    status: CodexPhaseStatus;
    startedAt?: Date;
    completedAt?: Date;
    spotlight?: string;
}
export interface CodexTemplateDecision {
    templateId: string;
    templateName: string;
    repository?: string;
    branch?: string;
    confidence?: number;
    rationale?: string;
    decidedAt?: Date;
}
export interface CodexWorkspaceVerification {
    directory: string;
    exists: boolean;
    discoveredEntries?: string[];
    verifiedAt?: Date;
    notes?: string;
}
export interface CodexTaskSummary {
    headline: string;
    bullets: string[];
    capturedAt: Date;
}
export interface CodexExecutionInsight {
    id: string;
    text: string;
    timestamp: Date;
    tone?: 'info' | 'success' | 'warning' | 'error';
}
export interface CodexSessionState {
    phases: CodexPhase[];
    templateDecision?: CodexTemplateDecision;
    workspaceVerification?: CodexWorkspaceVerification;
    taskSummary?: CodexTaskSummary;
    executionInsights?: CodexExecutionInsight[];
    lastUpdatedAt?: Date;
}
export interface GenerationState {
    id: string;
    projectId: string;
    projectName: string;
    operationType?: BuildOperationType;
    agentId?: AgentId;
    todos: TodoItem[];
    toolsByTodo: Record<number, ToolCall[]>;
    textByTodo: Record<number, TextMessage[]>;
    activeTodoIndex: number;
    isActive: boolean;
    startTime: Date;
    endTime?: Date;
    codex?: CodexSessionState;
}
export type GenerationEvent = {
    type: 'todo-update';
    todos: TodoItem[];
} | {
    type: 'tool-start';
    todoIndex: number;
    tool: ToolCall;
} | {
    type: 'tool-update';
    todoIndex: number;
    toolId: string;
    output: unknown;
    state: ToolCall['state'];
} | {
    type: 'complete';
};
