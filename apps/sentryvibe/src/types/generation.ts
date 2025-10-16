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

export type BuildOperationType =
  | 'initial-build'
  | 'enhancement'
  | 'focused-edit'
  | 'continuation';

export interface GenerationState {
  id: string; // Unique ID for this generation session
  projectId: string;
  projectName: string;
  operationType?: BuildOperationType; // Type of build operation
  todos: TodoItem[];
  toolsByTodo: Record<number, ToolCall[]>; // Tools nested under each todo index
  textByTodo: Record<number, TextMessage[]>; // Text messages nested under each todo
  activeTodoIndex: number; // Which todo is currently in progress
  isActive: boolean;
  startTime: Date;
  endTime?: Date;
}

export type GenerationEvent =
  | { type: 'todo-update'; todos: TodoItem[] }
  | { type: 'tool-start'; todoIndex: number; tool: ToolCall }
  | { type: 'tool-update'; todoIndex: number; toolId: string; output: unknown; state: ToolCall['state'] }
  | { type: 'complete' };