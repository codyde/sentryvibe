import { useState } from 'react';
import { render } from 'ink';
import { InitScreen, StartPromptScreen, type InitCallbacks, type InitConfig } from './screens/index.js';

export interface RunInitTUIOptions {
  onInit: (callbacks: InitCallbacks) => Promise<InitConfig>;
}

type InitAppScreen = 'init' | 'prompt';

interface InitAppProps {
  onInit: (callbacks: InitCallbacks) => Promise<InitConfig>;
  onComplete: (config: InitConfig, shouldStart: boolean) => void;
  onError: (error: Error) => void;
}

/**
 * Init App component that manages the init flow screens
 */
function InitApp({ onInit, onComplete, onError }: InitAppProps) {
  const [screen, setScreen] = useState<InitAppScreen>('init');
  const [config, setConfig] = useState<InitConfig | null>(null);

  const handleInitComplete = (initConfig: InitConfig) => {
    setConfig(initConfig);
    // Show the start prompt screen
    setScreen('prompt');
  };

  const handleStartChoice = (shouldStart: boolean) => {
    if (config) {
      onComplete(config, shouldStart);
    }
  };

  if (screen === 'prompt' && config) {
    return <StartPromptScreen onSelect={handleStartChoice} />;
  }

  return (
    <InitScreen
      onInit={onInit}
      onComplete={handleInitComplete}
      onError={onError}
    />
  );
}

/**
 * Render the TUI init screen
 * Returns a promise that resolves with config and whether to start
 */
export async function runInitTUI(options: RunInitTUIOptions): Promise<{ config: InitConfig; shouldStart: boolean }> {
  return new Promise((resolve, reject) => {
    let result: { config: InitConfig; shouldStart: boolean } | null = null;
    let error: Error | null = null;

    const { unmount, waitUntilExit } = render(
      <InitApp
        onInit={options.onInit}
        onComplete={(config, shouldStart) => {
          result = { config, shouldStart };
          // Give time for final render before unmounting
          setTimeout(() => {
            unmount();
          }, 100);
        }}
        onError={(err) => {
          error = err;
          // Keep error displayed, don't auto-unmount
        }}
      />,
      {
        exitOnCtrlC: true,
      }
    );

    waitUntilExit().then(() => {
      if (error) {
        reject(error);
      } else if (result) {
        resolve(result);
      } else {
        reject(new Error('Init cancelled'));
      }
    });
  });
}
