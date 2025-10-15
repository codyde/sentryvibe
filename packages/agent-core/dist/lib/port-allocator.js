"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reservePortForProject = reservePortForProject;
exports.updatePortReservationForProject = updatePortReservationForProject;
exports.releasePortForProject = releasePortForProject;
exports.buildEnvForFramework = buildEnvForFramework;
exports.getRunCommand = getRunCommand;
exports.withEnforcedPort = withEnforcedPort;
const client_1 = require("./db/client");
const schema_1 = require("./db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const FRAMEWORK_RANGES = {
    next: { start: 3000, end: 3100 },
    node: { start: 3000, end: 3100 },
    astro: { start: 4321, end: 4421 },
    vite: { start: 5173, end: 5273 },
    default: { start: 6000, end: 6100 },
};
const FRAMEWORK_ENV_MAP = {
    next: ['PORT', 'NEXT_PUBLIC_PORT'],
    node: ['PORT'],
    astro: ['PORT', 'ASTRO_PORT'],
    vite: ['PORT', 'VITE_PORT'],
    default: ['PORT'],
};
function resolveFramework(projectType, runCommand) {
    const normalizedType = projectType?.toLowerCase() ?? '';
    const normalizedCommand = runCommand?.toLowerCase() ?? '';
    if (normalizedType.includes('vite') || normalizedCommand.includes('vite')) {
        return 'vite';
    }
    if (normalizedType.includes('astro') || normalizedCommand.includes('astro')) {
        return 'astro';
    }
    if (normalizedType.includes('next') || normalizedCommand.includes('next')) {
        return 'next';
    }
    if (normalizedType.includes('node')) {
        return 'node';
    }
    return 'default';
}
function toFrameworkKey(value) {
    switch (value) {
        case 'next':
        case 'astro':
        case 'vite':
        case 'node':
            return value;
        default:
            return 'default';
    }
}
async function reservePortForProject(params) {
    const framework = resolveFramework(params.projectType, params.runCommand);
    const range = FRAMEWORK_RANGES[framework];
    const preferred = params.preferredPort ?? undefined;
    return client_1.db.transaction(async (tx) => {
        await tx.update(schema_1.portAllocations)
            .set({ projectId: null, reservedAt: null })
            .where((0, drizzle_orm_1.eq)(schema_1.portAllocations.projectId, params.projectId))
            .execute();
        const now = new Date();
        const tryReservePort = async (port) => {
            if (port < range.start || port > range.end) {
                return null;
            }
            const existing = await tx.select().from(schema_1.portAllocations)
                .where((0, drizzle_orm_1.eq)(schema_1.portAllocations.port, port))
                .limit(1)
                .execute();
            if (existing.length === 0) {
                await tx.insert(schema_1.portAllocations).values({
                    port,
                    framework,
                    projectId: params.projectId,
                    reservedAt: now,
                }).execute();
                return port;
            }
            if (existing[0].projectId === null) {
                await tx.update(schema_1.portAllocations)
                    .set({ projectId: params.projectId, reservedAt: now })
                    .where((0, drizzle_orm_1.eq)(schema_1.portAllocations.port, port))
                    .execute();
                return port;
            }
            return null;
        };
        if (preferred) {
            const reserved = await tryReservePort(preferred);
            if (reserved !== null) {
                return { port: reserved, framework };
            }
        }
        const reusable = await tx.select().from(schema_1.portAllocations)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.portAllocations.framework, framework), (0, drizzle_orm_1.isNull)(schema_1.portAllocations.projectId)))
            .orderBy(schema_1.portAllocations.port)
            .limit(1)
            .execute();
        if (reusable.length > 0) {
            await tx.update(schema_1.portAllocations)
                .set({ projectId: params.projectId, reservedAt: now })
                .where((0, drizzle_orm_1.eq)(schema_1.portAllocations.port, reusable[0].port))
                .execute();
            return { port: reusable[0].port, framework };
        }
        const rows = await tx.select({
            maxPort: (0, drizzle_orm_1.sql) `COALESCE(MAX(${schema_1.portAllocations.port}), ${range.start - 1})`,
        })
            .from(schema_1.portAllocations)
            .where((0, drizzle_orm_1.eq)(schema_1.portAllocations.framework, framework))
            .execute();
        const maxPort = rows[0]?.maxPort ?? range.start - 1;
        const nextPort = Math.max(range.start, maxPort + 1);
        if (nextPort > range.end) {
            throw new Error(`No available ports remaining for framework "${framework}" (${range.start}-${range.end}).`);
        }
        await tx.insert(schema_1.portAllocations).values({
            port: nextPort,
            framework,
            projectId: params.projectId,
            reservedAt: now,
        }).execute();
        return { port: nextPort, framework };
    });
}
async function updatePortReservationForProject(projectId, actualPort) {
    await client_1.db.transaction(async (tx) => {
        const rows = await tx.select().from(schema_1.portAllocations)
            .where((0, drizzle_orm_1.eq)(schema_1.portAllocations.projectId, projectId))
            .limit(1)
            .execute();
        if (rows.length === 0) {
            return;
        }
        const current = rows[0];
        if (current.port === actualPort) {
            return;
        }
        const frameworkKey = toFrameworkKey(current.framework);
        const range = FRAMEWORK_RANGES[frameworkKey] ?? FRAMEWORK_RANGES.default;
        if (actualPort < range.start || actualPort > range.end) {
            return;
        }
        const occupying = await tx.select().from(schema_1.portAllocations)
            .where((0, drizzle_orm_1.eq)(schema_1.portAllocations.port, actualPort))
            .limit(1)
            .execute();
        if (occupying.length > 0 && occupying[0].projectId !== null && occupying[0].projectId !== projectId) {
            return;
        }
        await tx.delete(schema_1.portAllocations).where((0, drizzle_orm_1.eq)(schema_1.portAllocations.port, current.port)).execute();
        const now = new Date();
        if (occupying.length > 0) {
            await tx.update(schema_1.portAllocations)
                .set({ projectId, reservedAt: now })
                .where((0, drizzle_orm_1.eq)(schema_1.portAllocations.port, actualPort))
                .execute();
        }
        else {
            await tx.insert(schema_1.portAllocations).values({
                port: actualPort,
                framework: current.framework,
                projectId,
                reservedAt: now,
            }).execute();
        }
    });
}
async function releasePortForProject(projectId) {
    await client_1.db.update(schema_1.portAllocations)
        .set({ projectId: null, reservedAt: null })
        .where((0, drizzle_orm_1.eq)(schema_1.portAllocations.projectId, projectId))
        .execute();
}
function buildEnvForFramework(framework, port) {
    const envKeys = FRAMEWORK_ENV_MAP[framework] ?? FRAMEWORK_ENV_MAP.default;
    const env = {};
    envKeys.forEach((key) => {
        env[key] = String(port);
    });
    // Also expose a generic dev server env var for client use
    env.DEV_SERVER_PORT = String(port);
    return env;
}
function getRunCommand(baseCommand) {
    if (!baseCommand || !baseCommand.trim()) {
        return 'npm run dev';
    }
    return baseCommand;
}
function withEnforcedPort(command, framework, port) {
    if (!port)
        return command;
    const trimmed = command.trim();
    if (!trimmed)
        return command;
    const needsExplicitPort = framework === 'vite' || framework === 'astro';
    if (!needsExplicitPort) {
        return command;
    }
    const cliArgs = `--port ${port} --host 0.0.0.0 --strictPort`;
    if (/^npm\s+run\s+/i.test(trimmed)) {
        return `${trimmed} -- ${cliArgs}`;
    }
    if (/^pnpm\s+/i.test(trimmed)) {
        return `${trimmed} -- ${cliArgs}`;
    }
    if (/^yarn\s+/i.test(trimmed)) {
        return `${trimmed} ${cliArgs}`;
    }
    if (/^bun\s+/i.test(trimmed)) {
        return `${trimmed} ${cliArgs}`;
    }
    if (trimmed.includes('astro')) {
        return `${trimmed} ${cliArgs}`;
    }
    if (trimmed.includes('vite')) {
        return `${trimmed} ${cliArgs}`;
    }
    return `${trimmed} -- ${cliArgs}`;
}
