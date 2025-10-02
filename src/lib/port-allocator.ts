import { db } from './db/client';
import { projects } from './db/schema';
import { eq } from 'drizzle-orm';
import net from 'net';

const PORT_RANGE_START = 3001;
const PORT_RANGE_END = 3100;

/**
 * Check if a port is available
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false); // Port is in use
      } else {
        resolve(false); // Some other error, consider unavailable
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true); // Port is available
    });

    server.listen(port);
  });
}

/**
 * Find an available port in the configured range
 */
export async function findAvailablePort(preferredPort?: number): Promise<number> {
  // If preferred port is provided and available, use it
  if (preferredPort && await isPortAvailable(preferredPort)) {
    return preferredPort;
  }

  // Get all ports currently in use by projects
  const allProjects = await db.select().from(projects);
  const usedPorts = new Set(
    allProjects
      .filter(p => p.devServerPort !== null)
      .map(p => p.devServerPort as number)
  );

  // Try to find an available port in range
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!usedPorts.has(port) && await isPortAvailable(port)) {
      console.log(`✅ Found available port: ${port}`);
      return port;
    }
  }

  throw new Error(`No available ports in range ${PORT_RANGE_START}-${PORT_RANGE_END}`);
}

/**
 * Get port-specific run command for a project
 */
export function getRunCommandWithPort(projectType: string | null, baseCommand: string, port: number): string {
  if (!projectType) {
    return baseCommand;
  }

  switch (projectType) {
    case 'next':
      return `PORT=${port} ${baseCommand}`;
    case 'vite':
      // Vite uses --port flag
      return `${baseCommand} --port ${port}`;
    default:
      return baseCommand;
  }
}
