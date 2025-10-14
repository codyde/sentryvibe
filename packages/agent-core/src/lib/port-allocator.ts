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

  return db.transaction(async (tx) => {
    await tx.update(portAllocations)
      .set({ projectId: null, reservedAt: null })
      .where(eq(portAllocations.projectId, params.projectId))
      .execute();

    const now = new Date();

    const tryReservePort = async (port: number): Promise<number | null> => {
      if (port < range.start || port > range.end) {
        return null;
      }

      const existing = await tx.select().from(portAllocations)
        .where(eq(portAllocations.port, port))
        .limit(1)
        .execute();

      if (existing.length === 0) {
        await tx.insert(portAllocations).values({
          port,
          framework,
          projectId: params.projectId,
          reservedAt: now,
        }).execute();
        return port;
      }

      if (existing[0].projectId === null) {
        await tx.update(portAllocations)
          .set({ projectId: params.projectId, reservedAt: now })
          .where(eq(portAllocations.port, port))
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

    const reusable = await tx.select().from(portAllocations)
      .where(and(eq(portAllocations.framework, framework), isNull(portAllocations.projectId)))
      .orderBy(portAllocations.port)
      .limit(1)
      .execute();

    if (reusable.length > 0) {
      await tx.update(portAllocations)
        .set({ projectId: params.projectId, reservedAt: now })
        .where(eq(portAllocations.port, reusable[0].port))
        .execute();
      return { port: reusable[0].port, framework };
    }

    const rows = await tx.select({
      maxPort: sql<number>`COALESCE(MAX(${portAllocations.port}), ${range.start - 1})`,
    })
      .from(portAllocations)
      .where(eq(portAllocations.framework, framework))
      .execute();

    const maxPort = rows[0]?.maxPort ?? range.start - 1;
    const nextPort = Math.max(range.start, maxPort + 1);
    if (nextPort > range.end) {
      throw new Error(`No available ports remaining for framework "${framework}" (${range.start}-${range.end}).`);
    }

    await tx.insert(portAllocations).values({
      port: nextPort,
      framework,
      projectId: params.projectId,
      reservedAt: now,
    }).execute();

    return { port: nextPort, framework };
  });
}

export async function updatePortReservationForProject(projectId: string, actualPort: number): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(portAllocations)
      .where(eq(portAllocations.projectId, projectId))
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

    const occupying = await tx.select().from(portAllocations)
      .where(eq(portAllocations.port, actualPort))
      .limit(1)
      .execute();

    if (occupying.length > 0 && occupying[0].projectId !== null && occupying[0].projectId !== projectId) {
      return;
    }

    await tx.delete(portAllocations).where(eq(portAllocations.port, current.port)).execute();

    const now = new Date();

    if (occupying.length > 0) {
      await tx.update(portAllocations)
        .set({ projectId, reservedAt: now })
        .where(eq(portAllocations.port, actualPort))
        .execute();
    } else {
      await tx.insert(portAllocations).values({
        port: actualPort,
        framework: current.framework,
        projectId,
        reservedAt: now,
      }).execute();
    }
  });
}

export async function releasePortForProject(projectId: string): Promise<void> {
  await db.update(portAllocations)
    .set({ projectId: null, reservedAt: null })
    .where(eq(portAllocations.projectId, projectId))
    .execute();
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

export function withEnforcedPort(command: string, framework: FrameworkKey, port: number | null | undefined): string {
  if (!port) return command;

  const trimmed = command.trim();
  if (!trimmed) return command;

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
