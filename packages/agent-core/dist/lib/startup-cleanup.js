"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupOrphanedProcesses = cleanupOrphanedProcesses;
const client_1 = require("@/lib/db/client");
const schema_1 = require("@/lib/db/schema");
const drizzle_orm_1 = require("drizzle-orm");
async function cleanupOrphanedProcesses() {
    console.log('🧹 Cleaning up orphaned dev server processes...');
    try {
        // Find all projects with running or starting dev servers
        const runningProjects = await client_1.db.select()
            .from(schema_1.projects)
            .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.projects.devServerStatus, 'running'), (0, drizzle_orm_1.eq)(schema_1.projects.devServerStatus, 'starting')));
        let cleanedCount = 0;
        for (const project of runningProjects) {
            if (project.devServerPid) {
                try {
                    // Try to kill the process
                    process.kill(project.devServerPid, 'SIGTERM');
                    // Force kill after 2 seconds
                    setTimeout(() => {
                        try {
                            if (project.devServerPid) {
                                process.kill(project.devServerPid, 'SIGKILL');
                            }
                        }
                        catch { }
                    }, 2000);
                    console.log(`  Killed orphaned process ${project.devServerPid} for project: ${project.name}`);
                    cleanedCount++;
                }
                catch (error) {
                    // Process might not exist anymore, that's fine
                    console.log(`  Process ${project.devServerPid} already dead for project: ${project.name}`);
                }
            }
            // Reset DB status
            await client_1.db.update(schema_1.projects)
                .set({
                devServerPid: null,
                devServerPort: null,
                devServerStatus: 'stopped',
            })
                .where((0, drizzle_orm_1.eq)(schema_1.projects.id, project.id));
        }
        console.log(`✅ Cleanup complete. Terminated ${cleanedCount} orphaned processes.`);
    }
    catch (error) {
        console.error('❌ Cleanup failed:', error);
    }
}
