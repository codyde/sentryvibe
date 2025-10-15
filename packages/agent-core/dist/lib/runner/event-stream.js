"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addRunnerEventSubscriber = addRunnerEventSubscriber;
exports.removeRunnerEventSubscriber = removeRunnerEventSubscriber;
exports.publishRunnerEvent = publishRunnerEvent;
const subscribers = global.__runnerEventSubscribers ?? new Map();
global.__runnerEventSubscribers = subscribers;
function addRunnerEventSubscriber(commandId, handler) {
    const existing = subscribers.get(commandId);
    if (existing) {
        existing.add(handler);
    }
    else {
        subscribers.set(commandId, new Set([handler]));
    }
    return () => removeRunnerEventSubscriber(commandId, handler);
}
function removeRunnerEventSubscriber(commandId, handler) {
    const set = subscribers.get(commandId);
    if (!set)
        return;
    set.delete(handler);
    if (set.size === 0) {
        subscribers.delete(commandId);
    }
}
function publishRunnerEvent(event) {
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
