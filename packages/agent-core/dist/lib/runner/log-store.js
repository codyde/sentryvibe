"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendRunnerLog = appendRunnerLog;
exports.markRunnerLogExit = markRunnerLogExit;
exports.subscribeToRunnerLogs = subscribeToRunnerLogs;
exports.getRunnerLogs = getRunnerLogs;
const MAX_LOG_ENTRIES = 1000;
const logBuffers = new Map();
const listeners = new Map();
function getBuffer(projectId) {
    if (!logBuffers.has(projectId)) {
        logBuffers.set(projectId, []);
    }
    return logBuffers.get(projectId);
}
function appendRunnerLog(projectId, entry) {
    const buffer = getBuffer(projectId);
    buffer.push(entry);
    if (buffer.length > MAX_LOG_ENTRIES) {
        buffer.splice(0, buffer.length - MAX_LOG_ENTRIES);
    }
    const projectListeners = listeners.get(projectId);
    if (projectListeners) {
        for (const listener of projectListeners) {
            listener({ type: 'log', entry });
        }
    }
}
function markRunnerLogExit(projectId, payload) {
    const projectListeners = listeners.get(projectId);
    if (projectListeners) {
        for (const listener of projectListeners) {
            listener({ type: 'exit', payload });
        }
    }
}
function subscribeToRunnerLogs(projectId, listener) {
    const set = listeners.get(projectId);
    if (set) {
        set.add(listener);
    }
    else {
        listeners.set(projectId, new Set([listener]));
    }
    return () => {
        const current = listeners.get(projectId);
        if (!current)
            return;
        current.delete(listener);
        if (current.size === 0) {
            listeners.delete(projectId);
        }
    };
}
function getRunnerLogs(projectId, limit) {
    const buffer = logBuffers.get(projectId);
    if (!buffer || buffer.length === 0) {
        return [];
    }
    if (!limit || limit >= buffer.length) {
        return [...buffer];
    }
    return buffer.slice(buffer.length - limit);
}
