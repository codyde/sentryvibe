import type { BuildRequest } from '@/types/build';
export interface AgentMessage {
    type: string;
    subtype?: string;
    message?: {
        id?: string;
        content?: Array<{
            type: string;
            text?: string;
            id?: string;
            name?: string;
            input?: unknown;
            tool_use_id?: string;
            content?: string;
        }>;
    };
    uuid?: string;
    error?: unknown;
    result?: unknown;
    usage?: unknown;
    finalResponse?: unknown;
}
export type AgentQueryFn = (args: {
    prompt: string;
    inputMessages: Array<{
        role: string;
        content: string;
    }>;
    options: Record<string, unknown>;
}) => AsyncGenerator<AgentMessage> | Promise<AsyncGenerator<AgentMessage>>;
export interface BuildStreamOptions extends BuildRequest {
    projectId: string;
    query: AgentQueryFn;
}
export declare function createBuildStream(options: BuildStreamOptions): Promise<ReadableStream<import("ai").InferUIMessageChunk<import("ai").UIMessage<unknown, import("ai").UIDataTypes, import("ai").UITools>>>>;
