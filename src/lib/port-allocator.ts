import { db } from './db/client';
import { portAllocations } from './db/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';

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

const FRAMEWORK_RANGES: Record<FrameworkKey, { start: number; end: number }> = {
  next: { start: 3000, end: 3100 },
  node: { start: 3000, end: 3100 },
  astro: { start: 4321, end: 4421 },
  vite: { start: 5173, end: 5273 },
  default: { start: 6000, end: 6100 },
};

const FRAMEWORK_ENV_MAP: Record<FrameworkKey, string[]> = {
  next: ['PORT', 'NEXT_PUBLIC_PORT'],
  node: ['PORT'],
  astro: ['PORT', 'ASTRO_PORT'],
  vite: ['PORT', 'VITE_PORT'],
  default: ['PORT'],
};

function resolveFramework(projectType: string | null, runCommand: string | null): FrameworkKey {
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

function toFrameworkKey(value: string): FrameworkKey {
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

export async function reservePortForProject(params: ReservePortParams): Promise<ReservedPortInfo> {
  const framework = resolveFramework(params.projectType, params.runCommand);
  const range = FRAMEWORK_RANGES[framework];
  const preferred = params.preferredPort ?? undefined;

  return db.transaction((tx) => {
    tx.update(portAllocations)
      .set({ projectId: null, reservedAt: null })
      .where(eq(portAllocations.projectId, params.projectId))
      .run();

    const now = new Date();

    const tryReservePort = (port: number): number | null => {
      if (port < range.start || port > range.end) {
        return null;
      }

      const existing = tx.select().from(portAllocations)
        .where(eq(portAllocations.port, port))
        .limit(1)
        .all();

      if (existing.length === 0) {
        tx.insert(portAllocations).values({
          port,
          framework,
          projectId: params.projectId,
          reservedAt: now,
        }).run();
        return port;
      }

      if (existing[0].projectId === null) {
        tx.update(portAllocations)
          .set({ projectId: params.projectId, reservedAt: now })
          .where(eq(portAllocations.port, port))
          .run();
        return port;
      }

      return null;
    };

    if (preferred) {
      const reserved = tryReservePort(preferred);
      if (reserved !== null) {
        return { port: reserved, framework };
      }
    }

    const reusable = tx.select().from(portAllocations)
      .where(and(eq(portAllocations.framework, framework), isNull(portAllocations.projectId)))
      .orderBy(portAllocations.port)
      .limit(1)
      .all();

    if (reusable.length > 0) {
      tx.update(portAllocations)
        .set({ projectId: params.projectId, reservedAt: now })
        .where(eq(portAllocations.port, reusable[0].port))
        .run();
      return { port: reusable[0].port, framework };
    }

    const row = tx.select({
      maxPort: sql<number>`COALESCE(MAX(${portAllocations.port}), ${range.start - 1})`,
    })
      .from(portAllocations)
      .where(eq(portAllocations.framework, framework))
      .get();

    const maxPort = row?.maxPort ?? range.start - 1;
    const nextPort = Math.max(range.start, maxPort + 1);
    if (nextPort > range.end) {
      throw new Error(`No available ports remaining for framework "${framework}" (${range.start}-${range.end}).`);
    }

    tx.insert(portAllocations).values({
      port: nextPort,
      framework,
      projectId: params.projectId,
      reservedAt: now,
    }).run();

    return { port: nextPort, framework };
  });
}

export async function updatePortReservationForProject(projectId: string, actualPort: number): Promise<void> {
  db.transaction((tx) => {
    const rows = tx.select().from(portAllocations)
      .where(eq(portAllocations.projectId, projectId))
      .limit(1)
      .all();

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

    const occupying = tx.select().from(portAllocations)
      .where(eq(portAllocations.port, actualPort))
      .limit(1)
      .all();

    if (occupying.length > 0 && occupying[0].projectId !== null && occupying[0].projectId !== projectId) {
      return;
    }

    tx.delete(portAllocations).where(eq(portAllocations.port, current.port)).run();

    const now = new Date();

    if (occupying.length > 0) {
      tx.update(portAllocations)
        .set({ projectId, reservedAt: now })
        .where(eq(portAllocations.port, actualPort))
        .run();
    } else {
      tx.insert(portAllocations).values({
        port: actualPort,
        framework: current.framework,
        projectId,
        reservedAt: now,
      }).run();
    }
  });
}

export async function releasePortForProject(projectId: string): Promise<void> {
  db.update(portAllocations)
    .set({ projectId: null, reservedAt: null })
    .where(eq(portAllocations.projectId, projectId))
    .run();
}

export function buildEnvForFramework(framework: FrameworkKey, port: number): Record<string, string> {
  const envKeys = FRAMEWORK_ENV_MAP[framework] ?? FRAMEWORK_ENV_MAP.default;
  const env: Record<string, string> = {};

  envKeys.forEach((key) => {
    env[key] = String(port);
  });

  // Also expose a generic dev server env var for client use
  env.DEV_SERVER_PORT = String(port);

  return env;
}

export function getRunCommand(baseCommand: string | null | undefined): string {
  if (!baseCommand || !baseCommand.trim()) {
    return 'npm run dev';
  }
  return baseCommand;
}
