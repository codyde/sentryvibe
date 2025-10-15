export type ProjectStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
/**
 * Minimal project shape required by shared helpers.
 * Additional properties provided by callers are allowed via index signature.
 */
export interface ProjectSummary {
    id: string;
    name: string;
    status: ProjectStatus;
    runCommand?: string | null;
    projectType?: string | null;
    [key: string]: unknown;
}
