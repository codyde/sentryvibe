import { useEffect, useState } from 'react';
import { Box, useApp, useStdout } from 'ink';
import { Banner, ProgressStepper, TaskList, ConfigSummary, NextSteps, ErrorSummary } from '../components/index.js';
import { useInitFlow } from '../hooks/index.js';
import type { ConfigItem } from '../components/ConfigSummary.js';

export interface InitConfig {
  workspace: string;
  monorepoPath?: string;
  databaseUrl?: string;
  apiUrl: string;
  runnerId: string;
}

export interface InitScreenProps {
  onInit: (callbacks: InitCallbacks) => Promise<InitConfig>;
  onComplete?: (config: InitConfig) => void;
  onError?: (error: Error) => void;
}

export interface InitCallbacks {
  // Step management
  activateStep: (stepId: string) => void;
  completeStep: (stepId: string) => void;
  failStep: (stepId: string) => void;
  // Task management
  startTask: (taskId: string, detail?: string) => void;
  completeTask: (taskId: string) => void;
  failTask: (taskId: string, error: string) => void;
  // Skip task (remove from display)
  skipTask: (taskId: string) => void;
  // Update task label
  updateTaskLabel: (taskId: string, label: string) => void;
  // Error handling
  setError: (message: string, suggestions: string[]) => void;
}

/**
 * Main init screen - fullscreen centered TUI
 */
export function InitScreen({ onInit, onComplete, onError }: InitScreenProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const flow = useInitFlow();
  const [finalConfig, setFinalConfig] = useState<InitConfig | null>(null);
  
  // Calculate vertical centering
  const terminalHeight = stdout?.rows || 24;
  const contentHeight = 20; // Approximate content height
  const topPadding = Math.max(0, Math.floor((terminalHeight - contentHeight) / 3));

  // Run init flow
  useEffect(() => {
    const callbacks: InitCallbacks = {
      activateStep: flow.activateStep,
      completeStep: flow.completeStep,
      failStep: flow.failStep,
      startTask: flow.startTask,
      completeTask: flow.completeTask,
      failTask: flow.failTask,
      skipTask: (taskId: string) => {
        // Remove task from the list by setting it as completed but we'll filter it out
        flow.setTaskStatus(taskId, 'completed');
      },
      updateTaskLabel: (taskId: string, label: string) => {
        flow.setTaskStatus(taskId, flow.state.tasks.find(t => t.id === taskId)?.status || 'pending');
      },
      setError: flow.setError,
    };

    onInit(callbacks)
      .then((config) => {
        setFinalConfig(config);
        
        // Set config summary items
        const configItems: ConfigItem[] = [
          { label: 'Workspace', value: config.workspace },
          { label: 'Server', value: config.apiUrl },
          { label: 'Runner', value: config.runnerId },
        ];
        
        if (config.monorepoPath) {
          configItems.push({ label: 'Repository', value: config.monorepoPath });
        }
        
        flow.setConfig(configItems);
        flow.markComplete();
        
        if (onComplete) {
          onComplete(config);
        }
      })
      .catch((error) => {
        if (onError) {
          onError(error);
        }
        // Don't exit immediately - let the error display
      });
  }, []); // Only run once on mount

  const { state } = flow;

  return (
    <Box flexDirection="column" alignItems="center" paddingTop={topPadding}>
      {/* Banner */}
      <Banner />
      
      {/* Spacer */}
      <Box marginTop={2} />
      
      {/* Progress Stepper */}
      <ProgressStepper steps={state.steps} />
      
      {/* Spacer */}
      <Box marginTop={2} />
      
      {/* Task List */}
      <TaskList tasks={state.tasks} />
      
      {/* Error Display */}
      {state.error && (
        <Box marginTop={2}>
          <ErrorSummary suggestions={state.error.suggestions} />
        </Box>
      )}
      
      {/* Completion Display */}
      {state.isComplete && !state.error && (
        <>
          <Box marginTop={2} />
          <ConfigSummary items={state.config} />
          <NextSteps command="sentryvibe run" url="http://localhost:3000" />
        </>
      )}
    </Box>
  );
}
