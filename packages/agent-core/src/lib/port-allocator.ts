import { db } from './db/client';
import { portAllocations } from './db/schema';
import { and, eq, isNull, sql, isNotNull, lt } from 'drizzle-orm';
import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildLogger } from './logging/build-logger';

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
    buildLogger.portAllocator.error('Failed to detect framework from filesystem', error);
  }
  
  return null; // Couldn't detect
}

/**
 * Resolve framework type from multiple sources
 * Priority: saved detectedFramework > projectType field > runCommand > 'default'
 * 
 * IMPORTANT: Once a framework is detected and saved during build, it should NOT change.
 * This prevents port range drift when projects are restarted.
 * 
 * Note: Filesystem detection removed from here - now happens on build completion
 */
async function resolveFramework(
  projectType: string | null, 
  runCommand: string | null,
  savedFramework?: string | null
): Promise<FrameworkKey> {
  // Strategy 1: Use saved framework (most reliable - detected during build)
  // This is the AUTHORITATIVE source once set - prevents port drift on restart
  if (savedFramework) {
    const framework = toFrameworkKey(savedFramework);
    buildLogger.log('info', 'port-allocator', `Using saved framework (locked): ${framework}`, { 
      savedFramework, 
      projectType, 
      runCommand 
    });
    return framework;
  }
  
  // Only fallback to detection if no saved framework exists
  // This should only happen for projects created before framework detection was implemented
  buildLogger.log('warn', 'port-allocator', 'No saved framework found, falling back to detection (may cause port drift)', {
    projectType,
    runCommand
  });

  // Strategy 2: Check projectType field
  const normalizedType = projectType?.toLowerCase() ?? '';
  if (normalizedType.includes('tanstack')) {
    buildLogger.log('debug', 'port-allocator', 'Detected from projectType: tanstack', { projectType });
    return 'tanstack';
  }
  if (normalizedType.includes('vite')) {
    buildLogger.log('debug', 'port-allocator', 'Detected from projectType: vite', { projectType });
    return 'vite';
  }
  if (normalizedType.includes('astro')) {
    buildLogger.log('debug', 'port-allocator', 'Detected from projectType: astro', { projectType });
    return 'astro';
  }
  if (normalizedType.includes('next')) {
    buildLogger.log('debug', 'port-allocator', 'Detected from projectType: next', { projectType });
    return 'next';
  }
  if (normalizedType.includes('node')) {
    buildLogger.log('debug', 'port-allocator', 'Detected from projectType: node', { projectType });
    return 'node';
  }

  // Strategy 3: Check runCommand
  const normalizedCommand = runCommand?.toLowerCase() ?? '';
  if (normalizedCommand.includes('vite')) {
    buildLogger.log('debug', 'port-allocator', 'Detected from runCommand: vite', { runCommand });
    return 'vite';
  }
  if (normalizedCommand.includes('astro')) {
    buildLogger.log('debug', 'port-allocator', 'Detected from runCommand: astro', { runCommand });
    return 'astro';
  }
  if (normalizedCommand.includes('tanstack')) {
    buildLogger.log('debug', 'port-allocator', 'Detected from runCommand: tanstack', { runCommand });
    return 'tanstack';
  }
  if (normalizedCommand.includes('next')) {
    buildLogger.log('debug', 'port-allocator', 'Detected from runCommand: next', { runCommand });
    return 'next';
  }

  buildLogger.log('warn', 'port-allocator', 'No framework detected, using default (port 6000+)', {
    projectType,
    runCommand
  });
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

/**
 * Check if a port is available by attempting to bind to it
 * Checks both localhost and 0.0.0.0 to ensure port is truly free
 * Returns true if port is free on both interfaces, false if in use on either
 */
export async function checkPortAvailability(port: number): Promise<boolean> {
  // Check localhost first
  const localhostAvailable = await checkSingleInterface(port, 'localhost');
  if (!localhostAvailable) {
    return false;
  }
  
  // Check 0.0.0.0
  const allInterfacesAvailable = await checkSingleInterface(port, '0.0.0.0');
  return allInterfacesAvailable;
}

/**
 * Check if a port is available on a specific interface
 */
function checkSingleInterface(port: number, host: string): Promise<boolean> {
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

    server.listen(port, host);
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
  
  buildLogger.log('debug', 'port-allocator', `Scanning for available port in range ${range.start}-${range.end}`, { 
    scanStart, 
    rangeStart: range.start, 
    rangeEnd: range.end 
  });
  
  // First pass: scan from scanStart to end of range
  for (let port = scanStart; port <= range.end; port++) {
    const isAvailable = await checkPortAvailability(port);
    if (isAvailable) {
      buildLogger.log('debug', 'port-allocator', `Found available port: ${port}`, { port });
      return port;
    }
    buildLogger.log('debug', 'port-allocator', `Port ${port} in use`, { port });
  }
  
  // Second pass: wrap around from range.start to scanStart (if we didn't start there)
  if (scanStart > range.start) {
    buildLogger.log('debug', 'port-allocator', `Wrapping around to scan ${range.start}-${scanStart - 1}`, { 
      rangeStart: range.start, 
      scanStart: scanStart - 1 
    });
    for (let port = range.start; port < scanStart; port++) {
      const isAvailable = await checkPortAvailability(port);
      if (isAvailable) {
        buildLogger.log('debug', 'port-allocator', `Found available port: ${port}`, { port });
        return port;
      }
      buildLogger.log('debug', 'port-allocator', `Port ${port} in use`, { port });
    }
  }
  
  buildLogger.portAllocator.portRangeExhausted(range.start, range.end);
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

  buildLogger.log('info', 'port-allocator', `Allocating port for project ${params.projectId}`, {
    projectId: params.projectId,
    framework,
    rangeStart: range.start,
    rangeEnd: range.end,
    skipPortCheck
  });

  // Step 1: Check existing allocation - reuse if still valid and available
  const existing = await getPortForProject(params.projectId);

  if (existing) {
    const withinRange = existing.port >= range.start && existing.port <= range.end;
    const sameFramework = existing.framework === framework;

    buildLogger.log('debug', 'port-allocator', `Found existing allocation: port ${existing.port}`, {
      port: existing.port,
      framework: existing.framework,
      projectId: params.projectId
    });

    if (!withinRange) {
      buildLogger.log('warn', 'port-allocator', `Port ${existing.port} outside valid range ${range.start}-${range.end}, will reallocate`, {
        port: existing.port,
        rangeStart: range.start,
        rangeEnd: range.end,
        projectId: params.projectId
      });
      await releasePortForProject(params.projectId);
    } else if (!sameFramework) {
      buildLogger.log('warn', 'port-allocator', `Framework mismatch (${existing.framework} → ${framework}), will reallocate`, {
        oldFramework: existing.framework,
        newFramework: framework,
        projectId: params.projectId
      });
      await releasePortForProject(params.projectId);
    } else {
      // Valid allocation - reuse if available or skipPortCheck
      if (skipPortCheck) {
        buildLogger.log('info', 'port-allocator', `Reusing port ${existing.port} (skipPortCheck=true)`, {
          port: existing.port,
          projectId: params.projectId
        });
        await db.update(portAllocations)
          .set({ reservedAt: new Date() })
          .where(eq(portAllocations.projectId, params.projectId))
          .execute();
        return existing;
      }

      const isAvailable = await checkPortAvailability(existing.port);
      if (isAvailable) {
        buildLogger.portAllocator.portAllocated(existing.port, params.projectId);
        await db.update(portAllocations)
          .set({ reservedAt: new Date() })
          .where(eq(portAllocations.projectId, params.projectId))
          .execute();
        return existing;
      }

      buildLogger.portAllocator.portInUse(existing.port);
      await releasePortForProject(params.projectId);
    }
  }

  // Step 2: Find an available port
  let availablePort: number | null = null;

  if (skipPortCheck) {
    // Remote runner: use DB-only allocation (trust that remote machine has ports available)
    buildLogger.log('info', 'port-allocator', 'Remote runner mode: using DB allocation without OS check', {
      projectId: params.projectId
    });
    try {
      const allocation = await reservePortForProject({
        ...params,
        detectedFramework: params.detectedFramework ?? framework,
      });
      availablePort = allocation.port;
      buildLogger.log('info', 'port-allocator', `Allocated port ${availablePort} from DB`, {
        port: availablePort,
        projectId: params.projectId
      });
    } catch (error) {
      throw new Error(`Unable to allocate port for remote runner: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else {
    // Local runner: scan OS for actually available port
    buildLogger.log('info', 'port-allocator', 'Local runner mode: scanning OS for available port', {
      projectId: params.projectId,
      preferredPort: params.preferredPort
    });
    availablePort = await findAvailablePortInRange(range, params.preferredPort ?? undefined);

    if (!availablePort) {
      throw new Error(
        `All ports in range ${range.start}-${range.end} are in use. ` +
        `Please stop other dev servers or free up ports.`
      );
    }
  }

  // Step 3: Reserve the port atomically in the database
  buildLogger.log('debug', 'port-allocator', `Reserving port ${availablePort} in database`, {
    port: availablePort,
    projectId: params.projectId
  });
  
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

  buildLogger.portAllocator.portAllocated(availablePort, params.projectId);
  
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
    buildLogger.portAllocator.allocationsCleared(cleanedCount);
  }
  
  return cleanedCount;
}
