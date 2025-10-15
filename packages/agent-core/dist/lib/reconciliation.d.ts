export interface ReconciliationResult {
    inDbNotFs: Array<{
        id: string;
        name: string;
        slug: string;
        path: string;
    }>;
    inFsNotDb: Array<{
        name: string;
        path: string;
    }>;
    synced: Array<{
        id: string;
        name: string;
        slug: string;
        path: string;
    }>;
    summary: {
        total: number;
        synced: number;
        orphanedDb: number;
        untracked: number;
    };
}
export declare function reconcileProjectsWithFilesystem(): Promise<ReconciliationResult>;
