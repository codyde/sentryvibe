import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
interface DevServerProcess {
    pid: number;
    process: ChildProcess;
    projectId: string;
    emitter: EventEmitter;
    logs: string[];
    startTime: Date;
}
declare global {
    var __devProcesses: Map<string, DevServerProcess> | undefined;
}
export interface StartDevServerOptions {
    projectId: string;
    command: string;
    cwd: string;
    env?: Record<string, string>;
}
export interface DevServerLog {
    timestamp: Date;
    type: 'stdout' | 'stderr';
    data: string;
}
export declare function startDevServer(options: StartDevServerOptions): {
    pid: number;
    port: number | null;
    emitter: EventEmitter;
};
export declare function stopDevServer(projectId: string): boolean;
export declare function getProcessInfo(projectId: string): DevServerProcess | undefined;
export declare function getAllProcesses(): Map<string, DevServerProcess>;
export declare function getProcessLogs(projectId: string, limit?: number): string[];
export declare function killAllProcesses(): void;
export {};
