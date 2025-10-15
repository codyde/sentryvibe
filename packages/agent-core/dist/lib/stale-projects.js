"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findStaleProjects = findStaleProjects;
exports.markStaleProjectsAsFailed = markStaleProjectsAsFailed;
const client_1 = require("./db/client");
const schema_1 = require("./db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const STALE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
async function findStaleProjects() {
    const allProjects = await client_1.db.select().from(schema_1.projects).where((0, drizzle_orm_1.eq)(schema_1.projects.status, 'in_progress'));
    const now = new Date();
    const staleProjects = [];
    for (const project of allProjects) {
        if (!project.lastActivityAt)
            continue;
        const lastActivity = new Date(project.lastActivityAt);
        const timeDiff = now.getTime() - lastActivity.getTime();
        if (timeDiff > STALE_TIMEOUT_MS) {
            staleProjects.push({
                id: project.id,
                name: project.name,
                slug: project.slug,
                status: project.status,
                lastActivityAt: project.lastActivityAt,
                minutesStale: Math.floor(timeDiff / 60000),
            });
        }
    }
    return staleProjects;
}
async function markStaleProjectsAsFailed() {
    const staleProjects = await findStaleProjects();
    let count = 0;
    for (const stale of staleProjects) {
        await client_1.db.update(schema_1.projects)
            .set({
            status: 'failed',
            errorMessage: `Generation timed out after ${stale.minutesStale} minutes of inactivity`,
            devServerStatus: 'stopped',
            devServerPid: null,
            devServerPort: null,
        })
            .where((0, drizzle_orm_1.eq)(schema_1.projects.id, stale.id));
        console.log(`⏰ Marked stale project as failed: ${stale.name} (${stale.minutesStale}m idle)`);
        count++;
    }
    return count;
}
