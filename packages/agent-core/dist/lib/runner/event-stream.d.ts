import type { RunnerEvent } from '../../shared/runner/messages';
type RunnerEventHandler = (event: RunnerEvent) => void;
declare global {
    var __runnerEventSubscribers: Map<string, Set<RunnerEventHandler>> | undefined;
}
export declare function addRunnerEventSubscriber(commandId: string, handler: RunnerEventHandler): () => void;
export declare function removeRunnerEventSubscriber(commandId: string, handler: RunnerEventHandler): void;
export declare function publishRunnerEvent(event: RunnerEvent): void;
export {};
