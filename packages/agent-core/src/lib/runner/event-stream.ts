import type { RunnerEvent } from '@/shared/runner/messages';

type RunnerEventHandler = (event: RunnerEvent) => void;

declare global {
  // eslint-disable-next-line no-var
  var __runnerEventSubscribers: Map<string, Set<RunnerEventHandler>> | undefined;
}

const subscribers =
  global.__runnerEventSubscribers ?? new Map<string, Set<RunnerEventHandler>>();

global.__runnerEventSubscribers = subscribers;

export function addRunnerEventSubscriber(commandId: string, handler: RunnerEventHandler) {
  const existing = subscribers.get(commandId);
  if (existing) {
    existing.add(handler);
  } else {
    subscribers.set(commandId, new Set([handler]));
  }
  return () => removeRunnerEventSubscriber(commandId, handler);
}

export function removeRunnerEventSubscriber(commandId: string, handler: RunnerEventHandler) {
  const set = subscribers.get(commandId);
  if (!set) return;
  set.delete(handler);
  if (set.size === 0) {
    subscribers.delete(commandId);
  }
}

export function publishRunnerEvent(event: RunnerEvent) {
  if (!event.commandId) {
    return;
  }
  const set = subscribers.get(event.commandId);
  if (!set) {
    return;
  }
  for (const handler of set) {
    handler(event);
  }
}
