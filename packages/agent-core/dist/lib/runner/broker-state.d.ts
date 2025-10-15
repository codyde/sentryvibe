import type { RunnerCommand } from '../../shared/runner/messages';
export declare function sendCommandToRunner(runnerId: string, command: RunnerCommand): Promise<void>;
export declare function listRunnerConnections(): Promise<any>;
