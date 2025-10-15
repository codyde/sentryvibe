export interface StaleProject {
    id: string;
    name: string;
    slug: string;
    status: string;
    lastActivityAt: Date | null;
    minutesStale: number;
}
export declare function findStaleProjects(): Promise<StaleProject[]>;
export declare function markStaleProjectsAsFailed(): Promise<number>;
