type LogStreamEvent = {
    type: 'log';
    entry: LogEntry;
} | {
    type: 'exit';
    payload?: {
        code?: number | null;
        signal?: string | null;
    };
};
export interface LogEntry {
    type: 'stdout' | 'stderr';
    data: string;
    timestamp: Date;
}
export declare function appendRunnerLog(projectId: string, entry: LogEntry): void;
export declare function markRunnerLogExit(projectId: string, payload?: {
    code?: number | null;
    signal?: string | null;
}): void;
export declare function subscribeToRunnerLogs(projectId: string, listener: (event: LogStreamEvent) => void): () => void;
export declare function getRunnerLogs(projectId: string, limit?: number): LogEntry[];
export {};
