import { useState, useCallback } from 'react';
import type { StepStatus } from '../components/ProgressStepper.js';
import type { TaskStatus } from '../components/TaskList.js';
import type { ConfigItem } from '../components/ConfigSummary.js';

export type InitPhase = 'repo' | 'build' | 'database' | 'ready';

export interface Task {
  id: string;
  label: string;
  status: TaskStatus;
  detail?: string;
  error?: string;
  stepId: string; // Which step this task belongs to
}

export interface Step {
  id: string;
  label: string;
  status: StepStatus;
}

export interface InitState {
  phase: InitPhase;
  steps: Step[];
  tasks: Task[];
  config: ConfigItem[];
  error: {
    message: string;
    suggestions: string[];
  } | null;
  isComplete: boolean;
}

const INITIAL_STEPS: Step[] = [
  { id: 'repo', label: 'Clone', status: 'pending' },
  { id: 'build', label: 'Build', status: 'pending' },
  { id: 'database', label: 'Configure', status: 'pending' },
  { id: 'ready', label: 'Finish', status: 'pending' },
];

// Tasks now have a stepId to associate them with a step
const INITIAL_TASKS: Task[] = [
  { id: 'clone', label: 'Cloning repository', status: 'pending', stepId: 'repo' },
  { id: 'deps', label: 'Installing dependencies', status: 'pending', stepId: 'build' },
  { id: 'build', label: 'Building packages', status: 'pending', stepId: 'build' },
  { id: 'database', label: 'Configuring database', status: 'pending', stepId: 'database' },
  { id: 'config', label: 'Saving configuration', status: 'pending', stepId: 'ready' },
  { id: 'services', label: 'Building services', status: 'pending', stepId: 'ready' },
];

export interface UseInitFlowReturn {
  state: InitState;
  // Step management
  setStepStatus: (stepId: string, status: StepStatus) => void;
  activateStep: (stepId: string) => void;
  completeStep: (stepId: string) => void;
  failStep: (stepId: string) => void;
  // Task management
  setTaskStatus: (taskId: string, status: TaskStatus, detail?: string) => void;
  startTask: (taskId: string, detail?: string) => void;
  completeTask: (taskId: string) => void;
  failTask: (taskId: string, error: string) => void;
  // Helper to get tasks for a specific step
  getTasksForStep: (stepId: string) => Task[];
  // Helper to get currently active tasks (running or just completed in current phase)
  getActiveStepTasks: () => Task[];
  // Config management
  setConfig: (items: ConfigItem[]) => void;
  // Error management
  setError: (message: string, suggestions: string[]) => void;
  clearError: () => void;
  // Completion
  markComplete: () => void;
  // Reset
  reset: () => void;
}

export function useInitFlow(): UseInitFlowReturn {
  const [state, setState] = useState<InitState>({
    phase: 'repo',
    steps: INITIAL_STEPS,
    tasks: INITIAL_TASKS,
    config: [],
    error: null,
    isComplete: false,
  });

  // Step management
  const setStepStatus = useCallback((stepId: string, status: StepStatus) => {
    setState(prev => ({
      ...prev,
      steps: prev.steps.map(step =>
        step.id === stepId ? { ...step, status } : step
      ),
    }));
  }, []);

  const activateStep = useCallback((stepId: string) => {
    setState(prev => ({
      ...prev,
      phase: stepId as InitPhase,
      steps: prev.steps.map(step =>
        step.id === stepId ? { ...step, status: 'active' } : step
      ),
    }));
  }, []);

  const completeStep = useCallback((stepId: string) => {
    setStepStatus(stepId, 'completed');
  }, [setStepStatus]);

  const failStep = useCallback((stepId: string) => {
    setStepStatus(stepId, 'error');
  }, [setStepStatus]);

  // Task management
  const setTaskStatus = useCallback((taskId: string, status: TaskStatus, detail?: string) => {
    setState(prev => ({
      ...prev,
      tasks: prev.tasks.map(task =>
        task.id === taskId ? { ...task, status, detail: detail ?? task.detail } : task
      ),
    }));
  }, []);

  const startTask = useCallback((taskId: string, detail?: string) => {
    setTaskStatus(taskId, 'running', detail);
  }, [setTaskStatus]);

  const completeTask = useCallback((taskId: string) => {
    setTaskStatus(taskId, 'completed');
  }, [setTaskStatus]);

  const failTask = useCallback((taskId: string, error: string) => {
    setState(prev => ({
      ...prev,
      tasks: prev.tasks.map(task =>
        task.id === taskId ? { ...task, status: 'failed', error } : task
      ),
    }));
  }, []);

  // Get tasks for a specific step
  const getTasksForStep = useCallback((stepId: string): Task[] => {
    return state.tasks.filter(task => task.stepId === stepId);
  }, [state.tasks]);

  // Get tasks for the currently active step
  const getActiveStepTasks = useCallback((): Task[] => {
    return state.tasks.filter(task => task.stepId === state.phase);
  }, [state.tasks, state.phase]);

  // Config management
  const setConfig = useCallback((items: ConfigItem[]) => {
    setState(prev => ({
      ...prev,
      config: items,
    }));
  }, []);

  // Error management
  const setError = useCallback((message: string, suggestions: string[]) => {
    setState(prev => ({
      ...prev,
      error: { message, suggestions },
    }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null,
    }));
  }, []);

  // Completion
  const markComplete = useCallback(() => {
    setState(prev => ({
      ...prev,
      isComplete: true,
      phase: 'ready',
      steps: prev.steps.map(step => ({ ...step, status: 'completed' })),
    }));
  }, []);

  // Reset
  const reset = useCallback(() => {
    setState({
      phase: 'repo',
      steps: INITIAL_STEPS,
      tasks: INITIAL_TASKS,
      config: [],
      error: null,
      isComplete: false,
    });
  }, []);

  return {
    state,
    setStepStatus,
    activateStep,
    completeStep,
    failStep,
    setTaskStatus,
    startTask,
    completeTask,
    failTask,
    getTasksForStep,
    getActiveStepTasks,
    setConfig,
    setError,
    clearError,
    markComplete,
    reset,
  };
}
