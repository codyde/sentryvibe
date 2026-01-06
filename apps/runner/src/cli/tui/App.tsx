import { render } from 'ink';
import { InitScreen, type InitCallbacks, type InitConfig } from './screens/index.js';

export interface RunInitTUIOptions {
  onInit: (callbacks: InitCallbacks) => Promise<InitConfig>;
}

/**
 * Render the TUI init screen
 * Returns a promise that resolves when init is complete
 */
export async function runInitTUI(options: RunInitTUIOptions): Promise<InitConfig> {
  return new Promise((resolve, reject) => {
    let result: InitConfig | null = null;
    let error: Error | null = null;

    const { unmount, waitUntilExit } = render(
      <InitScreen
        onInit={options.onInit}
        onComplete={(config) => {
          result = config;
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
