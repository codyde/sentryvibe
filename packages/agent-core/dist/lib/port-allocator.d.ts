interface ReservePortParams {
    projectId: string;
    projectType: string | null;
    runCommand: string | null;
    preferredPort?: number | null;
}
interface ReservedPortInfo {
    port: number;
    framework: FrameworkKey;
}
type FrameworkKey = 'next' | 'astro' | 'vite' | 'node' | 'default';
export declare function reservePortForProject(params: ReservePortParams): Promise<ReservedPortInfo>;
export declare function updatePortReservationForProject(projectId: string, actualPort: number): Promise<void>;
export declare function releasePortForProject(projectId: string): Promise<void>;
export declare function buildEnvForFramework(framework: FrameworkKey, port: number): Record<string, string>;
export declare function getRunCommand(baseCommand: string | null | undefined): string;
export declare function withEnforcedPort(command: string, framework: FrameworkKey, port: number | null | undefined): string;
export {};
