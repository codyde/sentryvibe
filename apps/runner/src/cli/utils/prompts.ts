import inquirer from 'inquirer';
import { homedir, hostname } from 'os';
import { join } from 'path';

export interface InitPromptAnswers {
  workspace: string;
  brokerUrl: string;
  secret: string;
  runnerId: string;
}

/**
 * Interactive prompts for CLI commands
 */
export class Prompts {
  /**
   * Prompt for initial configuration
   */
  async promptInit(): Promise<InitPromptAnswers> {
    const defaultWorkspace = join(homedir(), 'sentryvibe-workspace');

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'workspace',
        message: 'Where should projects be stored?',
        default: defaultWorkspace,
        validate: (input: string) => {
          if (!input || input.trim() === '') {
            return 'Workspace path is required';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'brokerUrl',
        message: 'Broker WebSocket URL:',
        default: 'ws://localhost:4000/socket', // Default to local
        validate: (input: string) => {
          if (!input || input.trim() === '') {
            return 'Broker URL is required';
          }
          if (!input.startsWith('ws://') && !input.startsWith('wss://')) {
            return 'Broker URL must start with ws:// or wss://';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'secret',
        message: 'Shared secret:',
        default: 'dev-secret', // Default local secret
        validate: (input: string) => {
          if (!input || input.trim() === '') {
            return 'Shared secret is required';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'runnerId',
        message: 'Runner ID (identifier for this machine):',
        default: 'local', // Default to 'local'
        validate: (input: string) => {
          if (!input || input.trim() === '') {
            return 'Runner ID is required';
          }
          return true;
        },
      },
    ]);

    return answers;
  }

  /**
   * Confirm action with user
   */
  async confirm(message: string, defaultValue: boolean = false): Promise<boolean> {
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message,
        default: defaultValue,
      },
    ]);
    return confirmed;
  }

  /**
   * Select from a list of options
   */
  async select(message: string, choices: string[]): Promise<string> {
    const { selected } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selected',
        message,
        choices,
      },
    ]);
    return selected;
  }

  /**
   * Prompt for text input
   */
  async input(message: string, defaultValue?: string): Promise<string> {
    const { value } = await inquirer.prompt([
      {
        type: 'input',
        name: 'value',
        message,
        default: defaultValue,
      },
    ]);
    return value;
  }
}

export const prompts = new Prompts();
