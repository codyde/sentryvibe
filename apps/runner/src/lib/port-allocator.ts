/**
 * Simple local port allocator for the runner
 * Manages port assignments without database dependency
 */

import { createConnection } from 'net';

const usedPorts = new Set<number>();

// Ports to avoid (reserved or commonly used)
const RESERVED_PORTS = new Set([
  6000, // X11
  5432, // Postgres
  3306, // MySQL
  27017, // MongoDB
  6379, // Redis
]);

/**
 * Check if a port is currently in use on the system
 * Returns true if port is IN USE (not available)
 */
async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = createConnection({ port, host: 'localhost' })
      .once('connect', () => {
        tester.end();
        resolve(true); // Port is in use
      })
      .once('error', (err: NodeJS.ErrnoException) => {
        tester.destroy();
        // ECONNREFUSED means nothing is listening = port is available
        resolve(err.code !== 'ECONNREFUSED');
      });
  });
}

/**
 * Allocate a free port from the available range
 * Checks both our internal tracking AND system availability
 */
export async function allocatePort(): Promise<number> {
  // Try ports from 3000-5999, 6001-9999
  const ranges = [
    { start: 3000, end: 5999 },
    { start: 6001, end: 9999 },
  ];

  for (const range of ranges) {
    for (let port = range.start; port <= range.end; port++) {
      if (!RESERVED_PORTS.has(port) && !usedPorts.has(port)) {
        // Check if port is actually available on the system
        const inUse = await isPortInUse(port);
        if (!inUse) {
          usedPorts.add(port);
          console.log(`[port-allocator] Allocated port: ${port}`);
          return port;
        } else {
          console.log(`[port-allocator] Port ${port} is already in use on system, skipping`);
        }
      }
    }
  }

  throw new Error('No available ports in range 3000-9999');
}

/**
 * Release a port back to the pool
 */
export function releasePort(port: number): void {
  usedPorts.delete(port);
  console.log(`[port-allocator] Released port: ${port}`);
}

/**
 * Get all currently allocated ports
 */
export function getAllocatedPorts(): number[] {
  return Array.from(usedPorts);
}
