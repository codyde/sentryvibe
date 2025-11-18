import { db } from './db/client';
import { portAllocations } from './db/schema';
import { and, eq, isNull, sql, isNotNull, lt } from 'drizzle-orm';
import { createServer } from 'net';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

interface ReservePortParams {
  projectId: string;
  projectType: string | null;
  runCommand: string | null;
  preferredPort?: number | null;
  detectedFramework?: string | null;  // Framework detected during build
}

interface ReservedPortInfo {
  port: number;
  framework: FrameworkKey;
}

type FrameworkKey = 'next' | 'astro' | 'vite' | 'tanstack' | 'node' | 'default';

const FRAMEWORK_RANGES: Record<FrameworkKey, { start: number; end: number }> = {
  next: { start: 3101, end: 3200 },
  node: { start: 3101, end: 3200 },
  tanstack: { start: 3101, end: 3200 },
  astro: { start: 4321, end: 4421 },
  vite: { start: 5173, end: 5273 },
  default: { start: 6000, end: 6100 },
};

const FRAMEWORK_ENV_MAP: Record<FrameworkKey, string[]> = {
  next: ['PORT', 'NEXT_PUBLIC_PORT'],
  node: ['PORT'],
  tanstack: ['PORT', 'VITE_PORT'],
  astro: ['PORT', 'ASTRO_PORT'],
  vite: ['PORT', 'VITE_PORT'],
  default: ['PORT'],
};

/**
 * Detect framework from project filesystem (package.json and config files)
 * Exported for use by runner to detect framework after build completion
 */
export async function detectFrameworkFromFilesystem(projectPath: string): Promise<FrameworkKey | null> {
  try {
    let cachedPkg: { deps: Record<string, unknown>; devDeps: Record<string, unknown>; devScript: string } | null = null;

    const loadPackageJson = async () => {
      if (cachedPkg) return cachedPkg;

      const pkgPath = join(projectPath, 'package.json');
      if (!existsSync(pkgPath)) {
        cachedPkg = null;
        return cachedPkg;
      }

      const pkgContent = await readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);
      cachedPkg = {
        deps: { ...(pkg.dependencies ?? {}), ...(pkg.peerDependencies ?? {}) },
        devDeps: pkg.devDependencies ?? {},
        devScript: pkg.scripts?.dev?.toLowerCase() ?? '',
      };
      return cachedPkg;
    };

    const hasTanStackDependency = async () => {
      const pkg = await loadPackageJson();
      if (!pkg) return false;
      const combined = { ...pkg.deps, ...pkg.devDeps } as Record<string, unknown>;
      if (combined['@tanstack/react-start']) return true;
      if (pkg.devScript.includes('tanstack')) return true;
      return false;
    };

    // Check for config files first (most reliable)
    if (existsSync(join(projectPath, 'astro.config.mjs')) || 
        existsSync(join(projectPath, 'astro.config.ts')) ||
        existsSync(join(projectPath, 'astro.config.js'))) {
      return 'astro';
    }
    
    if (existsSync(join(projectPath, 'next.config.ts')) || 
        existsSync(join(projectPath, 'next.config.js')) ||
        existsSync(join(projectPath, 'next.config.mjs'))) {
      return 'next';
    }
    
    if (existsSync(join(projectPath, 'vite.config.ts')) || 
        existsSync(join(projectPath, 'vite.config.js'))) {
      if (await hasTanStackDependency()) {
        return 'tanstack';
      }
      return 'vite';
    }

    // Check package.json dependencies
    const pkg = await loadPackageJson();
    if (pkg) {
      const allDeps = { ...pkg.deps, ...pkg.devDeps } as Record<string, unknown>;

      // Order matters: Astro uses Vite internally, so check Astro first
      if (allDeps['astro']) return 'astro';
      if (allDeps['@tanstack/react-start']) return 'tanstack';
      if (allDeps['next']) return 'next';
      if (allDeps['vite']) return 'vite';
      
      // Check scripts for clues
      if (pkg.devScript.includes('tanstack')) return 'tanstack';
      if (pkg.devScript.includes('astro')) return 'astro';
      if (pkg.devScript.includes('next')) return 'next';
      if (pkg.devScript.includes('vite')) return 'vite';
    }
  } catch (error) {
    console.error('[port-allocator] Failed to detect framework from filesystem:', error);
  }
  
  return null; // Couldn't detect
}

/**
 * Resolve framework type from multiple sources
 * Priority: saved detectedFramework > projectType field > runCommand > 'default'
 * Note: Filesystem detection removed from here - now happens on build completion
 */
async function resolveFramework(
  projectType: string | null, 
  runCommand: string | null,
  savedFramework?: string | null
): Promise<FrameworkKey> {
  // Debug logging
  console.log(`[port-allocator] Framework detection:`);
  console.log(`  savedFramework: "${savedFramework}"`);
  console.log(`  projectType: "${projectType}"`);
  console.log(`  runCommand: "${runCommand}"`);

  // Strategy 1: Use saved framework (most reliable - detected during build)
  if (savedFramework) {
    const framework = toFrameworkKey(savedFramework);
    console.log(`  ✅ Using saved framework: ${framework}`);
    return framework;
  }

  // Strategy 2: Check projectType field
  const normalizedType = projectType?.toLowerCase() ?? '';
  if (normalizedType.includes('tanstack')) {
    console.log(`  ✅ Detected from projectType: tanstack`);
    return 'tanstack';
  }
  if (normalizedType.includes('vite')) {
    console.log(`  ✅ Detected from projectType: vite`);
    return 'vite';
  }
  if (normalizedType.includes('astro')) {
    console.log(`  ✅ Detected from projectType: astro`);
    return 'astro';
  }
  if (normalizedType.includes('next')) {
    console.log(`  ✅ Detected from projectType: next`);
    return 'next';
  }
  if (normalizedType.includes('node')) {
    console.log(`  ✅ Detected from projectType: node`);
    return 'node';
  }

  // Strategy 3: Check runCommand
  const normalizedCommand = runCommand?.toLowerCase() ?? '';
  if (normalizedCommand.includes('vite')) {
    console.log(`  ✅ Detected from runCommand: vite`);
    return 'vite';
  }
  if (normalizedCommand.includes('astro')) {
    console.log(`  ✅ Detected from runCommand: astro`);
    return 'astro';
  }
  if (normalizedCommand.includes('tanstack')) {
    console.log(`  ✅ Detected from runCommand: tanstack`);
    return 'tanstack';
  }
  if (normalizedCommand.includes('next')) {
    console.log(`  ✅ Detected from runCommand: next`);
    return 'next';
  }

  console.log(`  ⚠️  No framework detected, using default (port 6000+)`);
  return 'default';
}

function toFrameworkKey(value: string): FrameworkKey {
  switch (value) {
    case 'next':
    case 'astro':
    case 'vite':
    case 'tanstack':
    case 'node':
      return value;
    default:
      return 'default';
  }
}

export async function reservePortForProject(params: ReservePortParams): Promise<ReservedPortInfo> {
  const framework = await resolveFramework(params.projectType, params.runCommand, params.detectedFramework);
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

  // Vite and Astro need explicit --port flags with --strictPort
  if (framework === 'vite' || framework === 'astro' || framework === 'tanstack') {
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

    if (trimmed.includes('astro') || trimmed.includes('vite')) {
      return `${trimmed} ${cliArgs}`;
    }

    return `${trimmed} -- ${cliArgs}`;
  }

  // Default framework: Try common port patterns
  if (framework === 'default') {
    // Most dev servers accept --port flag
    const cliArgs = `--port ${port} --host 0.0.0.0`;

    if (/^npm\s+run\s+/i.test(trimmed)) {
      return `${trimmed} -- ${cliArgs}`;
    }

    if (/^pnpm\s+/i.test(trimmed)) {
      return `${trimmed} -- ${cliArgs}`;
    }

    if (/^yarn\s+/i.test(trimmed)) {
      return `${trimmed} ${cliArgs}`;
    }

    return `${trimmed} -- ${cliArgs}`;
  }

  // Next.js needs -p flag (passed after --)
  if (framework === 'next') {
    const cliArgs = `-p ${port}`;

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

    if (trimmed.includes('next')) {
      return `${trimmed} ${cliArgs}`;
    }

    return `${trimmed} -- ${cliArgs}`;
  }

  // For node and default, rely on PORT env var
  return command;
}

/**
 * Check if a port is available by attempting to bind to it
 * Returns true if port is free, false if in use
 */
export async function checkPortAvailability(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        // Other errors (e.g., EACCES) also mean port is not available
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port, '0.0.0.0');
  });
}

/**
 * Intelligently scan for an available port in a range by checking actual OS availability
 * Starts from a preferred port (or range start) and scans upward, then wraps around if needed
 * Returns the first available port, or null if all ports in range are in use
 */
async function findAvailablePortInRange(
  range: { start: number; end: number },
  preferredStart?: number
): Promise<number | null> {
  const scanStart = preferredStart && preferredStart >= range.start && preferredStart <= range.end
    ? preferredStart
    : range.start;
  
  console.log(`[port-allocator] 🔍 Scanning for available port in range ${range.start}-${range.end}, starting from ${scanStart}`);
  
  // First pass: scan from scanStart to end of range
  for (let port = scanStart; port <= range.end; port++) {
    const isAvailable = await checkPortAvailability(port);
    if (isAvailable) {
      console.log(`[port-allocator] ✅ Found available port: ${port}`);
      return port;
    }
    console.log(`[port-allocator] ❌ Port ${port} in use`);
  }
  
  // Second pass: wrap around from range.start to scanStart (if we didn't start there)
  if (scanStart > range.start) {
    console.log(`[port-allocator] 🔄 Wrapping around to scan ${range.start}-${scanStart - 1}`);
    for (let port = range.start; port < scanStart; port++) {
      const isAvailable = await checkPortAvailability(port);
      if (isAvailable) {
        console.log(`[port-allocator] ✅ Found available port: ${port}`);
        return port;
      }
      console.log(`[port-allocator] ❌ Port ${port} in use`);
    }
  }
  
  console.warn(`[port-allocator] ⚠️  No available ports found in range ${range.start}-${range.end}`);
  return null;
}

/**
 * Get existing port allocation for a project
 * Returns null if no allocation exists
 */
export async function getPortForProject(projectId: string): Promise<ReservedPortInfo | null> {
  const rows = await db.select()
    .from(portAllocations)
    .where(eq(portAllocations.projectId, projectId))
    .limit(1)
    .execute();

  if (rows.length === 0) {
    return null;
  }

  const allocation = rows[0];
  return {
    port: allocation.port,
    framework: toFrameworkKey(allocation.framework),
  };
}

/**
 * Reserve a port for a project, with automatic reallocation if unavailable
 * This is the main function to use when starting dev servers
 * 
 * Algorithm:
 * 1. Check if project has existing valid allocation (reuse if available)
 * 2. Scan OS for available port in framework's range
 * 3. Reserve the port atomically in the database
 * 
 * For remote runners: skipPortCheck=true skips OS availability checks (trusts DB allocation)
 */
export async function reserveOrReallocatePort(params: ReservePortParams, skipPortCheck = false): Promise<ReservedPortInfo> {
  const framework = await resolveFramework(params.projectType, params.runCommand, params.detectedFramework);
  const range = FRAMEWORK_RANGES[framework];

  console.log(`[port-allocator] 🎯 Allocating port for project ${params.projectId}`);
  console.log(`[port-allocator]    Framework: ${framework}, Range: ${range.start}-${range.end}`);
  console.log(`[port-allocator]    Skip port check: ${skipPortCheck}`);

  // Step 1: Check existing allocation - reuse if still valid and available
  const existing = await getPortForProject(params.projectId);

  if (existing) {
    const withinRange = existing.port >= range.start && existing.port <= range.end;
    const sameFramework = existing.framework === framework;

    console.log(`[port-allocator] 📋 Found existing allocation: port ${existing.port} (framework: ${existing.framework})`);

    if (!withinRange) {
      console.warn(`[port-allocator] ⚠️  Port ${existing.port} outside valid range ${range.start}-${range.end}, will reallocate`);
      await releasePortForProject(params.projectId);
    } else if (!sameFramework) {
      console.warn(`[port-allocator] ⚠️  Framework mismatch (${existing.framework} → ${framework}), will reallocate`);
      await releasePortForProject(params.projectId);
    } else {
      // Valid allocation - reuse if available or skipPortCheck
      if (skipPortCheck) {
        console.log(`[port-allocator] ✅ Reusing port ${existing.port} (skipPortCheck=true)`);
        await db.update(portAllocations)
          .set({ reservedAt: new Date() })
          .where(eq(portAllocations.projectId, params.projectId))
          .execute();
        return existing;
      }

      const isAvailable = await checkPortAvailability(existing.port);
      if (isAvailable) {
        console.log(`[port-allocator] ✅ Reusing port ${existing.port} (still available)`);
        await db.update(portAllocations)
          .set({ reservedAt: new Date() })
          .where(eq(portAllocations.projectId, params.projectId))
          .execute();
        return existing;
      }

      console.warn(`[port-allocator] ❌ Port ${existing.port} no longer available, will reallocate`);
      await releasePortForProject(params.projectId);
    }
  }

  // Step 2: Find an available port
  let availablePort: number | null = null;

  if (skipPortCheck) {
    // Remote runner: use DB-only allocation (trust that remote machine has ports available)
    console.log(`[port-allocator] 🌐 Remote runner mode: using DB allocation without OS check`);
    try {
      const allocation = await reservePortForProject({
        ...params,
        detectedFramework: params.detectedFramework ?? framework,
      });
      availablePort = allocation.port;
      console.log(`[port-allocator] ✅ Allocated port ${availablePort} from DB`);
    } catch (error) {
      throw new Error(`Unable to allocate port for remote runner: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else {
    // Local runner: scan OS for actually available port
    console.log(`[port-allocator] 💻 Local runner mode: scanning OS for available port`);
    availablePort = await findAvailablePortInRange(range, params.preferredPort ?? undefined);

    if (!availablePort) {
      throw new Error(
        `All ports in range ${range.start}-${range.end} are in use. ` +
        `Please stop other dev servers or free up ports.`
      );
    }
  }

  // Step 3: Reserve the port atomically in the database
  console.log(`[port-allocator] 💾 Reserving port ${availablePort} in database`);
  
  await db.transaction(async (tx) => {
    // Clear any existing allocation for this project
    await tx.update(portAllocations)
      .set({ projectId: null, reservedAt: null })
      .where(eq(portAllocations.projectId, params.projectId))
      .execute();

    // Check if this port already exists in DB
    const existingPort = await tx.select()
      .from(portAllocations)
      .where(eq(portAllocations.port, availablePort!))
      .limit(1)
      .execute();

    const now = new Date();

    if (existingPort.length === 0) {
      // Insert new port allocation
      await tx.insert(portAllocations).values({
        port: availablePort!,
        framework,
        projectId: params.projectId,
        reservedAt: now,
      }).execute();
    } else {
      // Update existing port allocation
      await tx.update(portAllocations)
        .set({ projectId: params.projectId, framework, reservedAt: now })
        .where(eq(portAllocations.port, availablePort!))
        .execute();
    }
  });

  console.log(`[port-allocator] ✅ Successfully reserved port ${availablePort} for project ${params.projectId}\n`);
  
  return { port: availablePort, framework };
}

/**
 * Clean up port allocations for projects that have been inactive for more than 7 days
 * This should be called periodically (e.g., on app startup or via cron)
 */
export async function cleanupAbandonedPorts(): Promise<number> {
  const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
  
  const result = await db.update(portAllocations)
    .set({ projectId: null, reservedAt: null })
    .where(and(
      isNotNull(portAllocations.projectId),
      lt(portAllocations.reservedAt, threshold)
    ))
    .returning();
  
  const cleanedCount = result.length;
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} abandoned port allocation(s)`);
  }
  
  return cleanedCount;
}
