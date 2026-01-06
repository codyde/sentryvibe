/**
 * Main TUI entry point - shown when running `sentryvibe` without arguments
 * Provides a menu to Initialize, Start Runner, or Exit
 */

import { render } from 'ink';
import { MainMenuScreen, type MenuAction } from '../tui/screens/index.js';
import { configManager } from '../utils/config-manager.js';

/**
 * Run the main TUI menu
 */
export async function mainTUICommand(): Promise<void> {
  // Clear screen for fullscreen experience
  console.clear();

  const isInitialized = configManager.isInitialized();
  const hasRunnerKey = !!configManager.getSecret();

  return new Promise((resolve, reject) => {
    let selectedAction: MenuAction | null = null;

    const { unmount, waitUntilExit } = render(
      <MainMenuScreen
        isInitialized={isInitialized}
        hasRunnerKey={hasRunnerKey}
        onSelect={(action) => {
          selectedAction = action;
          unmount();
        }}
      />,
      {
        exitOnCtrlC: true,
      }
    );

    waitUntilExit().then(async () => {
      if (!selectedAction) {
        // User pressed Ctrl+C
        console.clear();
        process.exit(0);
      }

      switch (selectedAction) {
        case 'init':
          // Run init with TUI mode
          console.clear();
          const { initTUICommand } = await import('./init-tui.js');
          await initTUICommand({ yes: true });
          break;

        case 'start':
          if (!isInitialized) {
            // Not initialized, run init first
            console.clear();
            console.log('\n  SentryVibe is not initialized yet.\n');
            console.log('  Running initialization...\n');
            await sleep(1000);
            const { initTUICommand: initCmd } = await import('./init-tui.js');
            await initCmd({ yes: true });
          } else {
            // Start the runner
            console.clear();
            await startRunnerWithPrompt();
          }
          break;

        case 'exit':
          console.clear();
          console.log('\n  Goodbye!\n');
          process.exit(0);
          break;
      }

      resolve();
    }).catch(reject);
  });
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Start the runner, prompting for key if needed
 */
async function startRunnerWithPrompt(): Promise<void> {
  const currentSecret = configManager.getSecret();
  const hasKey = currentSecret && currentSecret !== 'dev-secret';

  if (hasKey) {
    // Has a key, ask if they want to use it or enter a new one
    const useExisting = await promptKeyChoice(currentSecret);
    
    if (useExisting) {
      console.log('\n  Starting SentryVibe with existing configuration...\n');
    } else {
      // Get new key
      const newKey = await promptForKey();
      if (newKey) {
        configManager.set('server', {
          ...configManager.get('server'),
          secret: newKey,
        });
        console.log('\n  Key updated. Starting SentryVibe...\n');
      } else {
        console.log('\n  Cancelled.\n');
        return;
      }
    }
  }

  // Start the runner
  const { runCommand } = await import('./run.js');
  await runCommand({});
}

/**
 * Prompt user to choose existing key or enter new one
 */
async function promptKeyChoice(existingKey: string): Promise<boolean> {
  const readline = await import('node:readline');
  
  // Mask the key for display
  const maskedKey = existingKey.substring(0, 8) + '...' + existingKey.substring(existingKey.length - 4);
  
  console.log(`\n  Current runner key: ${maskedKey}\n`);
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('  Use existing key? (Y/n) ', (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === '' || normalized === 'y' || normalized === 'yes');
    });
  });
}

/**
 * Prompt user to enter a new key
 */
async function promptForKey(): Promise<string | null> {
  const readline = await import('node:readline');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('  Enter new runner key: ', (answer) => {
      rl.close();
      const key = answer.trim();
      resolve(key || null);
    });
  });
}
