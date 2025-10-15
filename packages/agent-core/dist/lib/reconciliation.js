"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconcileProjectsWithFilesystem = reconcileProjectsWithFilesystem;
const client_1 = require("./db/client");
const schema_1 = require("./db/schema");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const workspace_1 = require("@/lib/workspace");
async function reconcileProjectsWithFilesystem() {
    const projectsDir = (0, workspace_1.getWorkspaceRoot)();
    // Get all projects from database
    const dbProjects = await client_1.db.select().from(schema_1.projects);
    // Get all directories from filesystem
    let fsDirs = [];
    try {
        await (0, promises_1.stat)(projectsDir);
        const entries = await (0, promises_1.readdir)(projectsDir, { withFileTypes: true });
        fsDirs = entries
            .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
            .map(entry => entry.name);
    }
    catch (error) {
        console.warn('Projects directory not found:', error);
    }
    const result = {
        inDbNotFs: [],
        inFsNotDb: [],
        synced: [],
        summary: {
            total: 0,
            synced: 0,
            orphanedDb: 0,
            untracked: 0,
        },
    };
    // Check which DB projects exist on filesystem
    for (const project of dbProjects) {
        const dirName = project.slug;
        const exists = fsDirs.includes(dirName);
        if (exists) {
            result.synced.push({
                id: project.id,
                name: project.name,
                slug: project.slug,
                path: project.path,
            });
        }
        else {
            result.inDbNotFs.push({
                id: project.id,
                name: project.name,
                slug: project.slug,
                path: project.path,
            });
        }
    }
    // Check which filesystem directories are not in DB
    const dbSlugs = new Set(dbProjects.map(p => p.slug));
    for (const dirName of fsDirs) {
        if (!dbSlugs.has(dirName)) {
            result.inFsNotDb.push({
                name: dirName,
                path: (0, path_1.join)(projectsDir, dirName),
            });
        }
    }
    // Calculate summary
    result.summary.total = dbProjects.length + result.inFsNotDb.length;
    result.summary.synced = result.synced.length;
    result.summary.orphanedDb = result.inDbNotFs.length;
    result.summary.untracked = result.inFsNotDb.length;
    return result;
}
